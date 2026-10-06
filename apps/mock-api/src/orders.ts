import type { Express } from 'express';
import type { Address, Order, OrderLine, PaymentRecord, Refund, ReturnRequest, Shipment } from '@aus/contracts';
import { taxComponentCents } from '@aus/contracts';
import { db, nextDocNumber, nextId, nextOrderNumber, audit, persist } from './db';
import { fail, getAuth, int, ok, requireStaff, str, uuid, nowIso } from './http';
import { addLoyalty, availableOf, findSku, moveInventory } from './domain';
import { buildCartView } from './catalog';

function orderForCustomer(order: Order, auth: { customer?: { id: string }; sessionKey?: string }, guestCode?: string): boolean {
  if (order.customerId) return !!auth.customer && order.customerId === auth.customer.id;
  // Guest orders: the creating browser session or the scoped access code may view them.
  return (!!guestCode && order.guestAccessCode === guestCode) ||
    (!!auth.sessionKey && order.ownerKey === `guest:${auth.sessionKey}` && !order.customerId);
}

export function registerOrderRoutes(app: Express): void {
  // ---------------------------------------------------------------- customer
  app.get('/orders', (req, res) => {
    const auth = getAuth(req);
    if (!auth.customer) fail(401, 'UNAUTHENTICATED', 'Sign in to view your orders.');
    ok(res, db.orders.filter((o) => o.customerId === auth.customer!.id));
  });

  app.get('/orders/:id', (req, res) => {
    const auth = getAuth(req);
    const order = db.orders.find((o) => o.id === req.params.id || o.number === req.params.id);
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    const guestCode = typeof req.query.code === 'string' ? req.query.code : undefined;
    if (auth.staff) {
      requireStaff(auth, 'orders');
      return ok(res, order);
    }
    if (!orderForCustomer(order, auth, guestCode)) {
      fail(403, 'FORBIDDEN', 'You do not have access to this order.');
    }
    ok(res, order);
  });

  // Reorder: adds current purchasable equivalents to the cart and reports unavailable lines.
  app.post('/orders/:id/reorder', (req, res) => {
    const auth = getAuth(req);
    if (!auth.customer) fail(401, 'UNAUTHENTICATED', 'Sign in to reorder.');
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order || order.customerId !== auth.customer!.id) fail(404, 'NOT_FOUND', 'Order not found.');
    const cart = (db.carts[auth.customer.id] ??= { ownerKey: auth.customer.id, lines: [], version: 0, updatedAt: nowIso() });
    const added: string[] = [];
    const unavailable: { name: string; reason: string }[] = [];
    for (const line of order.lines) {
      const sku = findSku(line.skuId);
      const productActive = sku && db.products.find((p) => p.id === sku.productId)?.status === 'ACTIVE';
      if (!sku || !sku.active || !productActive) {
        unavailable.push({ name: line.productName, reason: 'No longer sold' });
        continue;
      }
      const avail = availableOf(sku.id);
      const want = Math.max(line.quantity - line.refundedQty, 0);
      if (avail <= 0) {
        unavailable.push({ name: line.productName, reason: 'Out of stock' });
        continue;
      }
      const qty = Math.min(want, avail);
      if (qty < want) unavailable.push({ name: line.productName, reason: `Only ${qty} of ${want} available — added what we could` });
      const existing = cart.lines.find((l) => l.skuId === sku.id);
      if (existing) existing.quantity = Math.min(existing.quantity + qty, 99);
      else cart.lines.push({ skuId: sku.id, quantity: qty, addedAt: nowIso() });
      added.push(line.productName);
    }
    cart.version += 1;
    cart.updatedAt = nowIso();
    persist();
    ok(res, { added, unavailable, cart: buildCartView(auth.customer.id, auth.customer) });
  });

  // Customer return request: select lines, quantities and a reason. Does not refund by itself.
  app.post('/orders/:id/returns', (req, res) => {
    const auth = getAuth(req);
    const guestCode = typeof req.body?.accessCode === 'string' ? req.body.accessCode : undefined;
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    if (!auth.staff && !orderForCustomer(order, auth, typeof req.body?.accessCode === 'string' ? req.body.accessCode : undefined)) fail(403, 'FORBIDDEN', 'You do not have access to this order.');

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) fail(422, 'VALIDATION', 'Select at least one line to return.');
    const mapped = items.map((raw: { lineId?: string; quantity?: number; reason?: string }) => {
      const line = order.lines.find((l) => l.id === raw.lineId);
      if (!line) fail(422, 'VALIDATION', 'Unknown order line.');
      const qty = int(raw.quantity, 'Quantity', { min: 1 })!;
      const returnable = line.quantity - line.refundedQty;
      if (qty > returnable) fail(422, 'VALIDATION', `Only ${returnable} of ${line.productName} remain returnable.`, { lineId: line.id });
      const reason = str(raw.reason, 'Reason', { max: 500 })!;
      return { lineId: line.id, quantity: qty, reason };
    });

    const ret: ReturnRequest = {
      id: nextId('ret'), orderId: order.id, orderNumber: order.number,
      customerId: order.customerId, customerName: order.contact.name, customerEmail: order.contact.email,
      items: mapped, status: 'REQUESTED', requestedBy: auth.staff ? `${auth.staff.name} (${auth.staff.role})` : `${order.contact.name} (customer)`,
      createdAt: nowIso(),
    };
    order.returns.unshift(ret);
    persist();
    ok(res, ret);
  });

  // ---------------------------------------------------------------- admin: list + detail
  app.get('/admin/orders', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'orders');
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const payment = req.query.payment ? String(req.query.payment) : undefined;
    const fulfilment = req.query.fulfilment ? String(req.query.fulfilment) : undefined;
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const sort = String(req.query.sort ?? '-placedAt');
    const page = Math.max(1, int(req.query.page, 'Page', { min: 1 }) ?? 1);
    const pageSize = Math.min(100, int(req.query.pageSize, 'Page size', { min: 1 }) ?? 25);

    let items = [...db.orders];
    if (q) {
      items = items.filter((o) =>
        o.number.toLowerCase().includes(q) ||
        o.contact.name.toLowerCase().includes(q) ||
        o.contact.email.toLowerCase().includes(q) ||
        o.lines.some((l) => l.productName.toLowerCase().includes(q) || l.skuCode.toLowerCase().includes(q)),
      );
    }
    if (payment) items = items.filter((o) => o.paymentStatus === payment);
    if (fulfilment) items = items.filter((o) => o.fulfilmentStatus === fulfilment);
    if (from) items = items.filter((o) => o.placedAt >= new Date(from).toISOString());
    if (to) items = items.filter((o) => o.placedAt <= new Date(to + 'T23:59:59.999Z').toISOString());

    const dir = sort.startsWith('-') ? -1 : 1;
    const field = sort.replace(/^-/, '') as keyof Order;
    items.sort((a, b) => {
      const av = a[field] as string | number; const bv = b[field] as string | number;
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir;
    });

    ok(res, { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize });
  });

  app.get('/admin/orders/:id', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'orders');
    const order = db.orders.find((o) => o.id === req.params.id || o.number === req.params.id);
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    ok(res, order);
  });

  // ---------------------------------------------------------------- admin: manual orders
  interface DraftLineInput { skuId: string; quantity: number }

  function resolveDraftLines(inputs: DraftLineInput[]): OrderLine[] {
    return inputs.map((input) => {
      const sku = findSku(input.skuId);
      if (!sku || !sku.active) fail(422, 'VALIDATION', `Unknown SKU ${input.skuId}.`);
      const product = db.products.find((p) => p.id === sku.productId)!;
      const lineTotal = sku.priceCents * input.quantity;
      return {
        id: nextId('ln'), skuId: sku.id, skuCode: sku.code, productId: product.id,
        productName: product.name,
        optionSummary: Object.entries(sku.optionValues).map(([k, v]) => `${k}: ${v}`).join(', ') || (sku.packSize ?? ''),
        packSize: sku.packSize, imageGlyph: product.imageGlyph, imageHue: product.imageHue,
        unitPriceCents: sku.priceCents, quantity: input.quantity, taxClass: sku.taxClass,
        taxCents: taxComponentCents(lineTotal, sku.taxClass, db.settings.gstRate),
        lineTotalCents: lineTotal, pickedQty: 0, shippedQty: 0, refundedQty: 0, exception: 'NONE' as const,
      };
    });
  }

  function recalcManualTotals(order: Order): void {
    const subtotal = order.lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const afterDiscounts = Math.max(0, subtotal - order.manualDiscountCents);
    order.subtotalCents = subtotal;
    order.shippingCents = order.shippingAddress && afterDiscounts < db.settings.freeShippingThresholdCents ? db.settings.shippingFlatCents : 0;
    order.totalCents = afterDiscounts + order.shippingCents;
    order.gstIncludedCents = order.lines.reduce((s, l) => s + l.taxCents, 0);
  }

  function addressFromAdmin(b: Record<string, unknown>): Address {
    const postcode = str(b.postcode, 'Postcode')!;
    return {
      id: nextId('addr'), name: str(b.name, 'Name')!, phone: str(b.phone, 'Phone')!,
      line1: str(b.line1, 'Address line 1')!, line2: str(b.line2, 'Address line 2', { optional: true }),
      suburb: str(b.suburb, 'Suburb')!, state: str(b.state, 'State')!, postcode, country: 'AU',
      isDefaultShipping: false, isDefaultBilling: false,
    };
  }

  app.post('/admin/orders', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'manualOrders');
    const b = req.body ?? {};
    const customerId = str(b.customerId, 'Customer', { optional: true });
    if (customerId && !db.customers.find((c) => c.id === customerId)) fail(404, 'NOT_FOUND', 'Customer not found.');
    const lines = resolveDraftLines(Array.isArray(b.lines) ? b.lines : []);
    if (lines.length === 0) fail(422, 'VALIDATION', 'Add at least one line.');
    const order: Order = {
      id: nextId('ord'), number: nextOrderNumber(), ownerKey: customerId ?? `staff-draft`,
      customerId, guestAccessCode: undefined,
      contact: {
        name: str(b.contactName, 'Contact name')!,
        email: str(b.contactEmail, 'Contact email')!,
        phone: str(b.contactPhone, 'Contact phone', { optional: true }) ?? '',
      },
      lines, shippingAddress: addressFromAdmin(b.shippingAddress ?? {}),
      paymentStatus: 'UNPAID', fulfilmentStatus: 'DRAFT',
      subtotalCents: 0, coinDiscountCents: 0, manualDiscountCents: int(b.discountCents, 'Discount', { min: 0, optional: true }) ?? 0,
      shippingCents: 0, totalCents: 0, gstIncludedCents: 0,
      coinsEarnedPending: 0, coinsEarnedAvailable: 0, coinsRedeemed: 0,
      payments: [], refunds: [], shipments: [], documents: [], returns: [],
      internalNotes: b.notes ? [{ id: nextId('note'), authorId: staff.id, authorName: staff.name, body: str(b.notes, 'Notes')!, createdAt: nowIso() }] : [],
      exception: null, placedAt: nowIso(), createdBy: staff.name, updatedAt: nowIso(),
    };
    recalcManualTotals(order);
    db.orders.unshift(order);
    audit(staff.name, staff.role, 'ORDER_CREATED', order.id, `Manual order ${order.number} for ${order.contact.name} (${lines.length} lines)`, String(res.locals.rid));
    persist();
    ok(res, order);
  });

  app.put('/admin/orders/:id', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'manualOrders');
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    if (order.fulfilmentStatus !== 'DRAFT') fail(409, 'CONFLICT', 'Only draft orders can be edited. Issue a revision or credit note instead.');
    const b = req.body ?? {};
    if (Array.isArray(b.lines)) {
      order.lines = resolveDraftLines(b.lines);
    }
    if (b.discountCents != null) order.manualDiscountCents = int(b.discountCents, 'Discount', { min: 0 })!;
    if (b.shippingAddress) order.shippingAddress = addressFromAdmin(b.shippingAddress);
    if (b.notes) order.internalNotes.unshift({ id: nextId('note'), authorId: staff.id, authorName: staff.name, body: str(b.notes, 'Notes')!, createdAt: nowIso() });
    recalcManualTotals(order);
    order.updatedAt = nowIso();
    audit(staff.name, staff.role, 'ORDER_DRAFT_UPDATED', order.id, `Draft ${order.number} updated`, String(res.locals.rid));
    persist();
    ok(res, order);
  });

  // Invoice before payment (§7.4): issues a document; no payment, stock or shipment effects.
  app.post('/admin/orders/:id/issue-invoice', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'manualOrders');
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    if (order.fulfilmentStatus !== 'DRAFT') fail(409, 'CONFLICT', 'Invoice already issued for this order.');
    order.fulfilmentStatus = 'INVOICE_ISSUED';
    order.updatedAt = nowIso();
    const number = nextDocNumber('INVOICE');
    order.documents.unshift({ id: nextId('doc'), type: 'INVOICE', number, orderId: order.id, orderNumber: order.number, state: 'ISSUED', createdAt: nowIso(), createdBy: staff.name });
    audit(staff.name, staff.role, 'INVOICE_ISSUED', order.id, `Invoice ${number} issued for ${order.number} (unpaid — no stock reserved)`, String(res.locals.rid));
    persist();
    ok(res, order);
  });

  // Simulated payment link: records a pending payment attempt; does not reserve stock.
  app.post('/admin/orders/:id/payment-link', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'manualOrders');
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    if (order.paymentStatus !== 'UNPAID') fail(409, 'CONFLICT', 'Order is not awaiting payment.');
    const payment: PaymentRecord = {
      id: nextId('pay'), providerRef: `demo_link_${uuid().slice(0, 8)}`, method: 'PAYMENT_LINK',
      amountCents: order.totalCents, status: 'PENDING', refundedCents: 0,
      recordedBy: staff.name, createdAt: nowIso(),
    };
    order.payments.unshift(payment);
    order.paymentStatus = 'PENDING';
    order.updatedAt = nowIso();
    audit(staff.name, staff.role, 'PAYMENT_LINK_SENT', order.id, `Simulated payment link sent for ${order.number}`, String(res.locals.rid));
    persist();
    ok(res, { order, payment, link: `/pay/${order.number}/${payment.providerRef}` });
  });

  // Offline payment recording: atomically validates availability, commits stock, records payment.
  app.post('/admin/orders/:id/offline-payment', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'manualOrders');
    if (auth.staff!.role !== 'ADMIN' && auth.staff!.role !== 'FINANCE') {
      fail(403, 'FORBIDDEN', 'Recording offline payments requires ADMIN or FINANCE permission.');
    }
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    if (order.paymentStatus === 'PAID') fail(409, 'CONFLICT', 'Order is already paid.');
    const reference = str(req.body?.reference, 'Payment reference', { max: 80 })!;

    const unshipped = order.lines.filter((l) => l.shippedQty < l.quantity);
    const insufficient = unshipped.filter((l) => availableOf(l.skuId) < l.quantity - l.shippedQty - l.pickedQty);
    if (insufficient.length > 0) {
      fail(409, 'STOCK_UNAVAILABLE', 'Stock cannot be secured for this order — availability changed.',
        { lines: insufficient.map((l) => ({ skuCode: l.skuCode, available: availableOf(l.skuId), requested: l.quantity })) });
    }

    const payment: PaymentRecord = {
      id: nextId('pay'), providerRef: reference, method: 'OFFLINE',
      amountCents: order.totalCents, status: 'SUCCEEDED', refundedCents: 0,
      recordedBy: `${staff.name} (${staff.role})`, createdAt: nowIso(),
    };
    order.payments.unshift(payment);
    order.paymentStatus = 'PAID';
    if (order.fulfilmentStatus === 'DRAFT' || order.fulfilmentStatus === 'INVOICE_ISSUED' || order.fulfilmentStatus === 'AWAITING_PAYMENT') {
      order.fulfilmentStatus = 'READY_TO_PICK';
    }
    // Commit inventory for unshipped/unpicked quantities (§7.4).
    for (const line of unshipped) {
      const qty = line.quantity - line.shippedQty - line.pickedQty;
      if (qty > 0) moveInventory(line.skuId, { reserved: qty }, 'RESERVATION_HOLD', order.number, 'Offline payment recorded — stock committed', `${staff.name} (${staff.role})`);
    }
    if (order.customerId) {
      const earn = Math.floor((order.subtotalCents - order.manualDiscountCents) / 100) * db.settings.coinsPerDollar;
      if (earn > 0) {
        order.coinsEarnedPending = earn;
        addLoyalty(order.customerId, 'EARN_PENDING', earn, 0, order.number, 'Offline payment — coins pending');
      }
    }
    order.updatedAt = nowIso();
    audit(staff.name, staff.role, 'OFFLINE_PAYMENT_RECORDED', order.id, `Offline payment ${reference} recorded for ${order.number}; stock committed`, String(res.locals.rid));
    persist();
    ok(res, order);
  });

  app.post('/admin/orders/:id/notes', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'orders');
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    const note = { id: nextId('note'), authorId: staff.id, authorName: staff.name, body: str(req.body?.body, 'Note', { max: 1000 })!, createdAt: nowIso() };
    order.internalNotes.unshift(note);
    persist();
    ok(res, note);
  });

  // Cancel an order: releases outstanding holds/allocations for unshipped quantities.
  app.post('/admin/orders/:id/cancel', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'orders');
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    if (order.fulfilmentStatus === 'CANCELLED') fail(409, 'CONFLICT', 'Order already cancelled.');
    if (order.fulfilmentStatus === 'SHIPPED' || order.fulfilmentStatus === 'DELIVERED') {
      fail(409, 'CONFLICT', 'Shipped orders cannot be cancelled — use the returns workflow.');
    }
    for (const line of order.lines) {
      const outstanding = line.quantity - line.shippedQty;
      if (outstanding <= 0) continue;
      const pickedNotShipped = Math.min(line.pickedQty - line.shippedQty, outstanding);
      if (pickedNotShipped > 0) {
        moveInventory(line.skuId, { allocated: -pickedNotShipped }, 'CANCEL_RELEASE', order.number, 'Order cancelled — allocation released', staff.name);
      }
      const unpicked = outstanding - pickedNotShipped;
      if (unpicked > 0 && (order.fulfilmentStatus === 'READY_TO_PICK' || order.fulfilmentStatus === 'PICKING' || order.fulfilmentStatus === 'PICKED')) {
        moveInventory(line.skuId, { reserved: -unpicked }, 'CANCEL_RELEASE', order.number, 'Order cancelled — reservation released', staff.name);
      }
      line.exception = 'CANCELLED';
    }
    order.fulfilmentStatus = 'CANCELLED';
    order.updatedAt = nowIso();
    if (order.paymentStatus === 'PAID') {
      const refund: Refund = {
        id: nextId('ref'), orderId: order.id, paymentId: order.payments[0]?.id ?? '',
        amountCents: order.totalCents, status: 'SUCCEEDED',
        reason: 'Order cancelled — automatic refund (simulated)', requestedBy: staff.name,
        creditNoteNumber: nextDocNumber('CREDIT_NOTE'), createdAt: nowIso(), resolvedAt: nowIso(),
      };
      order.refunds.unshift(refund);
      const payment = order.payments[0];
      if (payment) { payment.status = 'REFUNDED'; payment.refundedCents = order.totalCents; }
      order.paymentStatus = 'REFUNDED';
    }
    if (order.customerId && order.coinsEarnedPending > 0) {
      addLoyalty(order.customerId, 'EARN_REVERSAL', -order.coinsEarnedPending, 0, order.number, 'Order cancelled — pending coins reversed');
      order.coinsEarnedPending = 0;
    }
    audit(staff.name, staff.role, 'ORDER_CANCELLED', order.id, `${order.number} cancelled; holds released`, String(res.locals.rid));
    persist();
    ok(res, order);
  });
}

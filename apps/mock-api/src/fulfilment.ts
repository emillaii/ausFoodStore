import type { Express } from 'express';
import type { Order, Shipment } from '@aus/contracts';
import { db, nextDocNumber, nextId, audit, persist } from './db';
import { fail, getAuth, int, ok, requireStaff, str, nowIso } from './http';
import { addLoyalty, moveInventory } from './domain';

function getOrder(id: string): Order {
  const order = db.orders.find((o) => o.id === id || o.number === id);
  if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
  return order;
}

function refreshFulfilmentStatus(order: Order): void {
  const lines = order.lines;
  const fullyShipped = lines.every((l) => l.shippedQty >= l.quantity);
  const partiallyShipped = lines.some((l) => l.shippedQty > 0);
  const fullyPicked = lines.every((l) => l.pickedQty >= l.quantity || l.exception === 'CANCELLED');
  if (fullyShipped) order.fulfilmentStatus = 'SHIPPED';
  else if (partiallyShipped) order.fulfilmentStatus = 'PARTIALLY_SHIPPED';
  else if (order.fulfilmentStatus === 'PICKED' || order.fulfilmentStatus === 'PACKED') {
    // keep packed state; recompute only downward transitions guard below
  } else if (fullyPicked && lines.some((l) => l.pickedQty > 0)) order.fulfilmentStatus = 'PICKED';
}

export function registerFulfilmentRoutes(app: Express): void {
  const queue = (req: any, res: any, perm: 'fulfilment') => requireStaff(getAuth(req), perm);

  // Ready-to-pick queue
  app.get('/admin/fulfilment/queue', (req, res) => {
    queue(req, res, 'fulfilment');
    const statuses = ['READY_TO_PICK', 'PICKING', 'PICKED', 'PACKED', 'PARTIALLY_SHIPPED'];
    ok(res, db.orders.filter((o) => statuses.includes(o.fulfilmentStatus)));
  });

  // Start picking: transfer committed reserved quantities into allocated.
  app.post('/admin/orders/:id/start-picking', (req, res) => {
    const staff = queue(req, res, 'fulfilment');
    const order = getOrder(req.params.id);
    if (order.fulfilmentStatus !== 'READY_TO_PICK') {
      fail(409, 'CONFLICT', `Order is ${order.fulfilmentStatus}; only paid orders ready to pick can start picking.`);
    }
    for (const line of order.lines) {
      const qty = line.quantity - line.pickedQty;
      if (qty > 0) {
        moveInventory(line.skuId, { reserved: -qty, allocated: qty }, 'PICK_ALLOCATE', order.number, 'Picking started', staff.name);
      }
    }
    order.fulfilmentStatus = 'PICKING';
    order.updatedAt = nowIso();
    persist();
    ok(res, order);
  });

  // Confirm picked quantities per line. Short picks open an exception (never silent).
  app.post('/admin/orders/:id/pick', (req, res) => {
    const staff = queue(req, res, 'fulfilment');
    const order = getOrder(req.params.id);
    if (order.fulfilmentStatus !== 'PICKING') fail(409, 'CONFLICT', 'Start picking before confirming quantities.');
    const line = order.lines.find((l) => l.id === req.body?.lineId);
    if (!line) fail(404, 'NOT_FOUND', 'Order line not found.');
    const qty = int(req.body?.quantity, 'Picked quantity', { min: 0 })!;
    if (qty > line.quantity) fail(422, 'VALIDATION', `Cannot pick more than the ordered ${line.quantity}.`);
    if (qty < line.pickedQty) fail(422, 'VALIDATION', 'Picked quantity cannot decrease.');

    line.pickedQty = qty;
    if (qty < line.quantity) {
      line.exception = 'SHORT_PICKED';
    } else {
      line.exception = 'NONE';
    }
    refreshFulfilmentStatus(order);
    order.updatedAt = nowIso();
    if (qty < line.quantity) {
      audit(staff.name, staff.role, 'SHORT_PICK', order.id, `${line.skuCode}: picked ${qty}/${line.quantity} — exception opened`, String(res.locals.rid));
    }
    persist();
    ok(res, order);
  });

  // Re-pick an exception line once stock is found (moves allocation back into the line).
  app.post('/admin/orders/:id/exception/:lineId/resolve', (req, res) => {
    const staff = queue(req, res, 'fulfilment');
    const order = getOrder(req.params.id);
    const line = order.lines.find((l) => l.id === req.params.lineId);
    if (!line || line.exception !== 'SHORT_PICKED') fail(409, 'CONFLICT', 'No open short-pick exception on this line.');
    const action = str(req.body?.action, 'Action')!;
    if (action === 'cancel-remaining') {
      const remaining = line.quantity - line.pickedQty;
      moveInventory(line.skuId, { allocated: -remaining }, 'SHORT_PICK_RELEASE', order.number, 'Short pick — remaining allocation released', staff.name);
      line.exception = 'CANCELLED';
      audit(staff.name, staff.role, 'SHORT_PICK_CANCELLED', order.id, `${line.skuCode}: cancelled remaining ${remaining}`, String(res.locals.rid));
    } else if (action === 'mark-picked') {
      line.pickedQty = line.quantity;
      line.exception = 'NONE';
      audit(staff.name, staff.role, 'SHORT_PICK_RESOLVED', order.id, `${line.skuCode}: stock found, full quantity picked`, String(res.locals.rid));
    } else {
      fail(422, 'VALIDATION', 'Action must be cancel-remaining or mark-picked.');
    }
    refreshFulfilmentStatus(order);
    order.updatedAt = nowIso();
    persist();
    ok(res, order);
  });

  // Pack: only when every line is fully picked (or explicitly cancelled).
  app.post('/admin/orders/:id/pack', (req, res) => {
    const staff = queue(req, res, 'fulfilment');
    const order = getOrder(req.params.id);
    if (!['PICKED', 'PICKING', 'PARTIALLY_SHIPPED'].includes(order.fulfilmentStatus)) {
      fail(409, 'CONFLICT', `Order is ${order.fulfilmentStatus}; confirm picked quantities first.`);
    }
    const openExceptions = order.lines.filter((l) => l.exception === 'SHORT_PICKED');
    if (openExceptions.length > 0) {
      fail(409, 'CONFLICT', 'Resolve open short-pick exceptions before packing.',
        { lines: openExceptions.map((l) => l.skuCode) });
    }
    const unpicked = order.lines.filter((l) => l.pickedQty < l.quantity && l.exception !== 'CANCELLED');
    if (unpicked.length > 0) {
      fail(409, 'CONFLICT', 'Confirm picked quantities for every line before packing.',
        { lines: unpicked.map((l) => ({ skuCode: l.skuCode, picked: l.pickedQty, ordered: l.quantity })) });
    }
    order.fulfilmentStatus = 'PACKED';
    order.updatedAt = nowIso();
    const number = nextDocNumber('PACKING_SLIP');
    order.documents.unshift({ id: nextId('doc'), type: 'PACKING_SLIP', number, orderId: order.id, orderNumber: order.number, state: 'ISSUED', createdAt: nowIso(), createdBy: staff.name });
    persist();
    ok(res, order);
  });

  // Create a shipment with exact per-line quantities (no more than remaining fulfilment quantities).
  app.post('/admin/orders/:id/shipments', (req, res) => {
    const staff = queue(req, res, 'fulfilment');
    const order = getOrder(req.params.id);
    if (order.paymentStatus !== 'PAID') fail(409, 'CONFLICT', 'Only paid orders can ship.');
    const carrier = str(req.body?.carrier, 'Carrier', { max: 60 })!;
    const service = str(req.body?.service, 'Service', { optional: true, max: 60 }) ?? 'Standard';
    const tracking = str(req.body?.trackingNumber, 'Tracking number', { max: 60 })!;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) fail(422, 'VALIDATION', 'Add at least one line to the shipment.');

    const mapped = items.map((raw: { lineId?: string; quantity?: number }) => {
      const line = order.lines.find((l) => l.id === raw.lineId);
      if (!line) fail(422, 'VALIDATION', 'Unknown order line.');
      const qty = int(raw.quantity, 'Quantity', { min: 1 })!;
      const remaining = Math.min(line.pickedQty, line.quantity) - line.shippedQty;
      if (qty > remaining) {
        fail(422, 'VALIDATION', `${line.skuCode}: only ${remaining} picked and not yet shipped.`, { lineId: line.id, remaining });
      }
      return { lineId: line.id, quantity: qty };
    });

    const shipment: Shipment = {
      id: nextId('shp'), carrier, service, trackingNumber: tracking, items: mapped,
      state: 'CREATED', createdAt: nowIso(),
    };
    order.shipments.unshift(shipment);
    order.updatedAt = nowIso();
    persist();
    ok(res, order);
  });

  // Dispatch: reduces allocated + on-hand exactly once (guarded by shipment state).
  app.post('/admin/orders/:id/shipments/:shipId/dispatch', (req, res) => {
    const staff = queue(req, res, 'fulfilment');
    const order = getOrder(req.params.id);
    const shipment = order.shipments.find((s) => s.id === req.params.shipId);
    if (!shipment) fail(404, 'NOT_FOUND', 'Shipment not found.');
    if (shipment.state === 'DISPATCHED') {
      return ok(res, { order, duplicate: true }); // idempotent replay — no double reduction
    }
    if (shipment.state !== 'CREATED') fail(409, 'CONFLICT', 'Shipment cannot be dispatched.');
    for (const item of shipment.items) {
      const line = order.lines.find((l) => l.id === item.lineId)!;
      moveInventory(line.skuId, { allocated: -item.quantity, onHand: -item.quantity }, 'DISPATCH', order.number, `Dispatched via ${shipment.carrier} ${shipment.trackingNumber}`, staff.name);
      line.shippedQty += item.quantity;
    }
    shipment.state = 'DISPATCHED';
    shipment.dispatchedAt = nowIso();
    refreshFulfilmentStatus(order);
    order.updatedAt = nowIso();

    // Loyalty: pending earnings mature when the order fully ships (sample policy).
    if (order.fulfilmentStatus === 'SHIPPED' && order.customerId && order.coinsEarnedPending > 0) {
      const amount = order.coinsEarnedPending;
      const entry = { customerId: order.customerId, amount, order: order.number };
      addLoyalty(entry.customerId, 'PENDING_MATURED', -amount, amount, order.number, 'Order fully shipped — coins available');
      order.coinsEarnedPending = 0;
      order.coinsEarnedAvailable = amount;
    }
    persist();
    ok(res, { order, duplicate: false });
  });

  app.post('/admin/orders/:id/shipments/:shipId/cancel', (req, res) => {
    const staff = queue(req, res, 'fulfilment');
    const order = getOrder(req.params.id);
    const shipment = order.shipments.find((s) => s.id === req.params.shipId);
    if (!shipment || shipment.state !== 'CREATED') fail(409, 'CONFLICT', 'Only created (not dispatched) shipments can be cancelled.');
    shipment.state = 'CANCELLED';
    order.updatedAt = nowIso();
    audit(staff.name, staff.role, 'SHIPMENT_CANCELLED', order.id, `Shipment ${shipment.trackingNumber} cancelled`, String(res.locals.rid));
    persist();
    ok(res, order);
  });
}

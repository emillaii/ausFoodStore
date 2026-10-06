import type { Express } from 'express';
import type { DocumentType, Order, Product, Promotion } from '@aus/contracts';
import { db, nextDocNumber, nextId, audit, persist } from './db';
import { fail, getAuth, int, ok, requireStaff, str, nowIso } from './http';
import { addLoyalty, loyaltyBalance, moveInventory } from './domain';
import { PERMISSION_MATRIX, ROLE_LABELS } from '@aus/contracts';

const getOrder = (id: string): Order => {
  const order = db.orders.find((o) => o.id === id || o.number === id);
  if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
  return order;
};

export function registerAdminRoutes(app: Express): void {
  // ---------------------------------------------------------------- products (admin catalogue)
  app.get('/admin/products', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'orders');
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const status = req.query.status ? String(req.query.status) : undefined;
    const category = req.query.category ? String(req.query.category) : undefined;
    const page = Math.max(1, int(req.query.page, 'Page', { min: 1 }) ?? 1);
    const pageSize = Math.min(100, int(req.query.pageSize, 'Page size', { min: 1 }) ?? 20);
    let items = [...db.products];
    if (q) items = items.filter((p) => p.name.toLowerCase().includes(q) || p.skus.some((s) => s.code.toLowerCase().includes(q)));
    if (status) items = items.filter((p) => p.status === status);
    if (category) {
      const cat = db.categories.find((c) => c.slug === category);
      if (cat) items = items.filter((p) => p.categoryIds.includes(cat.id));
    }
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const views = items.map((p) => ({
      ...p,
      skus: p.skus.map((s) => ({ ...s, available: s.id in db.inventory ? db.inventory[s.id].onHand - db.inventory[s.id].reserved - db.inventory[s.id].allocated : 0 })),
    }));
    ok(res, { items: views.slice((page - 1) * pageSize, page * pageSize), total: views.length, page, pageSize });
  });

  app.get('/admin/products/:id', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'orders');
    const p = db.products.find((x) => x.id === req.params.id || x.slug === req.params.id);
    if (!p) fail(404, 'NOT_FOUND', 'Product not found.');
    ok(res, p);
  });

  function skuFromBody(raw: unknown): Product['skus'][number] {
    const b = raw as Record<string, unknown>;
    const priceCents = int(b.priceCents, 'Price', { min: 1 })!;
    const memberPriceCents = int(b.memberPriceCents, 'Member price', { optional: true, min: 1 });
    const salePriceCents = int(b.salePriceCents, 'Sale price', { optional: true, min: 1 });
    if (memberPriceCents != null && memberPriceCents >= priceCents) fail(422, 'VALIDATION', 'Member price must be below the base price.');
    if (salePriceCents != null && salePriceCents >= priceCents) fail(422, 'VALIDATION', 'Sale price must be below the base price.');
    return {
      id: typeof b.id === 'string' && b.id ? b.id : nextId('sku'),
      code: str(b.code, 'SKU code', { max: 40 })!.toUpperCase(),
      productId: '', optionValues: (b.optionValues as Record<string, string>) ?? {},
      packSize: str(b.packSize, 'Pack size', { optional: true, max: 40 }),
      priceCents, memberPriceCents, salePriceCents,
      saleStartsAt: str(b.saleStartsAt, 'Sale start', { optional: true }),
      saleEndsAt: str(b.saleEndsAt, 'Sale end', { optional: true }),
      taxClass: b.taxClass === 'GST_FREE' ? 'GST_FREE' : 'GST',
      active: b.active !== false,
    };
  }

  app.post('/admin/products', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'products');
    const b = req.body ?? {};
    const slugBase = str(b.slug ?? b.name, 'Slug', { max: 80 })!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = slugBase;
    let n = 2;
    while (db.products.some((p) => p.slug === slug)) slug = `${slugBase}-${n++}`;
    const rawSkus: unknown[] = Array.isArray(b.skus) ? b.skus : [];
    const skus = rawSkus.map(skuFromBody);
    if (skus.length === 0) fail(422, 'VALIDATION', 'Add at least one SKU.');
    const codes = new Set<string>();
    for (const s of skus) {
      if (codes.has(s.code)) fail(422, 'VALIDATION', `Duplicate SKU code ${s.code}.`);
      codes.add(s.code);
    }
    const product: Product = {
      id: nextId('prod'), slug, name: str(b.name, 'Name', { max: 120 })!,
      brand: str(b.brand, 'Brand', { optional: true, max: 60 }),
      description: str(b.description, 'Description', { max: 4000 }) ?? '',
      specs: Array.isArray(b.specs) ? b.specs : [],
      imageGlyph: str(b.imageGlyph, 'Glyph', { optional: true }) ?? '🛒',
      imageHue: int(b.imageHue, 'Hue', { min: 0, max: 360, optional: true }) ?? Math.floor(Math.random() * 360),
      categoryIds: Array.isArray(b.categoryIds) ? b.categoryIds.filter((c: unknown) => db.categories.some((cat) => cat.id === c)) : [],
      status: 'DRAFT', skus: skus.map((s) => ({ ...s, productId: '' })),
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    product.skus = product.skus.map((s) => ({ ...s, productId: product.id }));
    for (const s of product.skus) {
      db.inventory[s.id] = { skuId: s.id, onHand: 0, reserved: 0, allocated: 0, lowStockThreshold: 10, version: 1 };
      db.stockMovements.unshift({
        id: nextId('mov'), skuId: s.id, type: 'SEED', deltas: { onHand: 0 },
        before: { onHand: 0, reserved: 0, allocated: 0 }, after: { onHand: 0, reserved: 0, allocated: 0 },
        reference: 'PRODUCT-CREATED', reason: 'New product created with zero stock', actor: `${staff.name} (${staff.role})`,
        createdAt: nowIso(),
      });
    }
    db.products.unshift(product);
    audit(staff.name, staff.role, 'PRODUCT_CREATED', product.id, `Product "${product.name}" created as draft (${skus.length} SKU)`, String(res.locals.rid));
    persist();
    ok(res, product);
  });

  app.put('/admin/products/:id', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'products');
    const product = db.products.find((x) => x.id === req.params.id);
    if (!product) fail(404, 'NOT_FOUND', 'Product not found.');
    const b = req.body ?? {};
    // Optimistic concurrency: client must send the updatedAt it read (§8.2 version checks).
    if (b.expectedUpdatedAt && b.expectedUpdatedAt !== product.updatedAt) {
      fail(409, 'VERSION_CONFLICT', 'This product was edited by someone else. Reload and re-apply your changes.',
        { currentUpdatedAt: product.updatedAt });
    }
    if (b.name != null) product.name = str(b.name, 'Name', { max: 120 })!;
    if (b.brand !== undefined) product.brand = str(b.brand, 'Brand', { optional: true, max: 60 });
    if (b.description != null) product.description = str(b.description, 'Description', { max: 4000 })!;
    if (Array.isArray(b.specs)) product.specs = b.specs;
    if (b.imageGlyph != null) product.imageGlyph = str(b.imageGlyph, 'Glyph')!;
    if (b.imageHue != null) product.imageHue = int(b.imageHue, 'Hue', { min: 0, max: 360 })!;
    if (Array.isArray(b.categoryIds)) {
      product.categoryIds = b.categoryIds.filter((c: unknown) => db.categories.some((cat) => cat.id === c));
    }
    if (Array.isArray(b.skus)) {
      for (const raw of b.skus) {
        const sku = skuFromBody(raw);
        const existing = product.skus.find((s) => s.id === sku.id);
        if (existing) {
          Object.assign(existing, sku, { productId: product.id });
        } else {
          if (product.skus.some((s) => s.code === sku.code)) fail(422, 'VALIDATION', `Duplicate SKU code ${sku.code}.`);
          product.skus.push({ ...sku, productId: product.id });
          db.inventory[sku.id] = { skuId: sku.id, onHand: 0, reserved: 0, allocated: 0, lowStockThreshold: 10, version: 1 };
        }
      }
    }
    product.updatedAt = nowIso();
    audit(staff.name, staff.role, 'PRODUCT_UPDATED', product.id, `Product "${product.name}" updated`, String(res.locals.rid));
    persist();
    ok(res, product);
  });

  for (const action of ['publish', 'archive', 'draft'] as const) {
    app.post(`/admin/products/:id/${action}`, (req, res) => {
      const auth = getAuth(req);
      const staff = requireStaff(auth, 'products');
      const product = db.products.find((x) => x.id === req.params.id);
      if (!product) fail(404, 'NOT_FOUND', 'Product not found.');
      product.status = action === 'publish' ? 'ACTIVE' : action === 'archive' ? 'ARCHIVED' : 'DRAFT';
      product.updatedAt = nowIso();
      audit(staff.name, staff.role, `PRODUCT_${action.toUpperCase()}`, product.id, `Product "${product.name}" → ${product.status}`, String(res.locals.rid));
      persist();
      ok(res, product);
    });
  }

  // ---------------------------------------------------------------- categories (admin)
  app.get('/admin/categories', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'categories');
    ok(res, db.categories.map((c) => ({
      ...c,
      productCount: db.products.filter((p) => p.categoryIds.includes(c.id)).length,
    })).sort((a, b) => (a.parentId ?? a.id) === (b.parentId ?? b.id) ? a.displayOrder - b.displayOrder : 0));
  });

  function wouldCycle(id: string | null, parentId: string | null): boolean {
    if (!id || !parentId) return false;
    let current: string | null = parentId;
    const seen = new Set<string>();
    while (current) {
      if (current === id || seen.has(current)) return true;
      seen.add(current);
      current = db.categories.find((c) => c.id === current)?.parentId ?? null;
    }
    return false;
  }

  app.post('/admin/categories', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'categories');
    const b = req.body ?? {};
    const parentId = str(b.parentId, 'Parent', { optional: true }) ?? null;
    const name = str(b.name, 'Name', { max: 60 })!;
    const slugBase = str(b.slug ?? name, 'Slug', { max: 80 })!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = slugBase;
    let n = 2;
    while (db.categories.some((c) => c.slug === slug)) slug = `${slugBase}-${n++}`;
    if (parentId && !db.categories.some((c) => c.id === parentId)) fail(404, 'NOT_FOUND', 'Parent category not found.');
    const cat = {
      id: nextId('cat'), slug, name, parentId, displayOrder: int(b.displayOrder, 'Order', { min: 0, optional: true }) ?? 99,
      active: b.active !== false, imageGlyph: str(b.imageGlyph, 'Glyph', { optional: true }) ?? '🏷️',
    };
    db.categories.push(cat);
    audit(staff.name, staff.role, 'CATEGORY_CREATED', cat.id, `Category "${name}" created`, String(res.locals.rid));
    persist();
    ok(res, cat);
  });

  app.put('/admin/categories/:id', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'categories');
    const cat = db.categories.find((c) => c.id === req.params.id);
    if (!cat) fail(404, 'NOT_FOUND', 'Category not found.');
    const b = req.body ?? {};
    if (b.name != null) cat.name = str(b.name, 'Name', { max: 60 })!;
    if (b.parentId !== undefined) {
      const parentId = str(b.parentId, 'Parent', { optional: true }) ?? null;
      if (parentId === cat.id) fail(422, 'VALIDATION', 'A category cannot be its own parent.');
      if (parentId && wouldCycle(cat.id, parentId)) fail(422, 'VALIDATION', 'That parent would create a cycle in the category hierarchy.');
      if (parentId && !db.categories.some((c) => c.id === parentId)) fail(404, 'NOT_FOUND', 'Parent category not found.');
      cat.parentId = parentId;
    }
    if (b.displayOrder != null) cat.displayOrder = int(b.displayOrder, 'Order', { min: 0 })!;
    if (b.active != null) cat.active = b.active === true;
    if (b.imageGlyph != null) cat.imageGlyph = str(b.imageGlyph, 'Glyph')!;
    audit(staff.name, staff.role, 'CATEGORY_UPDATED', cat.id, `Category "${cat.name}" updated`, String(res.locals.rid));
    persist();
    ok(res, cat);
  });

  app.delete('/admin/categories/:id', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'categories');
    const cat = db.categories.find((c) => c.id === req.params.id);
    if (!cat) fail(404, 'NOT_FOUND', 'Category not found.');
    if (db.categories.some((c) => c.parentId === cat.id)) {
      fail(409, 'CONFLICT', 'This category has subcategories. Move or delete them first.');
    }
    if (db.products.some((p) => p.categoryIds.includes(cat.id))) {
      fail(409, 'CONFLICT', 'This category is referenced by products. Remove it from those products first.');
    }
    db.categories = db.categories.filter((c) => c.id !== cat.id);
    audit(staff.name, staff.role, 'CATEGORY_DELETED', cat.id, `Category "${cat.name}" deleted`, String(res.locals.rid));
    persist();
    ok(res, { ok: true });
  });

  // ---------------------------------------------------------------- dashboard
  app.get('/admin/dashboard', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'orders');
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86_400_000);
    const to = req.query.to ? new Date(String(req.query.to) + 'T23:59:59.999Z') : new Date();
    const paid = db.orders.filter((o) => ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(o.paymentStatus) && !o.placedAt.startsWith('1970'));
    const inRange = paid.filter((o) => {
      const t = new Date(o.placedAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
    const salesTotalCents = inRange.reduce((sum, o) => sum + o.totalCents, 0);
    const awaitingPick = db.orders.filter((o) => o.fulfilmentStatus === 'READY_TO_PICK');
    const pendingRefunds = db.orders.flatMap((o) => o.returns.filter((r) => r.status === 'REQUESTED').map((r) => ({ order: o.number, return: r })));
    const lowStock = Object.values(db.inventory)
      .map((inv) => {
        const sku = db.products.flatMap((p) => p.skus).find((s) => s.id === inv.skuId)!;
        const product = db.products.find((p) => p.id === sku.productId)!;
        return { skuCode: sku.code, productName: product.name, available: inv.onHand - inv.reserved - inv.allocated, threshold: inv.lowStockThreshold };
      })
      .filter((r) => r.available <= r.threshold)
      .sort((a, b) => a.available - b.available);
    ok(res, {
      range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      salesDefinition: 'Sum of order totals (incl. shipping, after discounts) for orders with captured payment placed in range. Refunded orders included at original value.',
      salesTotalCents, paidOrders: inRange.length,
      awaitingPick: awaitingPick.map((o) => ({ id: o.id, number: o.number, contact: o.contact.name, placedAt: o.placedAt })),
      pendingRefunds: pendingRefunds.map((p) => ({ orderNumber: p.order, returnId: p.return.id, items: p.return.items.length, createdAt: p.return.createdAt })),
      lowStock: lowStock.slice(0, 10),
    });
  });

  // ---------------------------------------------------------------- customers
  app.get('/admin/customers', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'customers');
    const q = String(req.query.q ?? '').trim().toLowerCase();
    let items = db.customers.map((c) => ({
      id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName, phone: c.phone,
      member: c.member, state: c.state, createdAt: c.createdAt,
      orderCount: db.orders.filter((o) => o.customerId === c.id).length,
      loyalty: loyaltyBalance(c.id),
    }));
    if (q) items = items.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || c.email.includes(q));
    ok(res, { items, total: items.length });
  });

  app.get('/admin/customers/:id', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'customers');
    const c = db.customers.find((x) => x.id === req.params.id);
    if (!c) fail(404, 'NOT_FOUND', 'Customer not found.');
    const { password, ...safe } = c;
    void password;
    ok(res, {
      ...safe,
      addresses: db.addresses[c.id] ?? [],
      orders: db.orders.filter((o) => o.customerId === c.id),
      loyalty: loyaltyBalance(c.id),
      loyaltyTransactions: db.loyalty.filter((e) => e.customerId === c.id).slice(0, 50),
    });
  });

  app.post('/admin/customers/:id/notes', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'customers');
    const c = db.customers.find((x) => x.id === req.params.id);
    if (!c) fail(404, 'NOT_FOUND', 'Customer not found.');
    const note = { id: nextId('note'), authorId: staff.id, authorName: staff.name, body: str(req.body?.body, 'Note', { max: 1000 })!, createdAt: nowIso() };
    c.notes.unshift(note);
    audit(staff.name, staff.role, 'CUSTOMER_NOTE_ADDED', c.id, 'Note added (staff-only)', String(res.locals.rid));
    persist();
    ok(res, note);
  });

  // ---------------------------------------------------------------- returns & refunds
  app.get('/admin/returns', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'returns');
    const status = req.query.status ? String(req.query.status) : undefined;
    const items = db.orders.flatMap((o) => o.returns.map((r) => ({ ...r, order: o })));
    ok(res, { items: status ? items.filter((r) => r.status === status) : items });
  });

  app.post('/admin/returns/:returnId/decision', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'returns');
    const b = req.body ?? {};
    const decision = str(b.decision, 'Decision')!;
    let found: { order: Order; ret: (typeof db.orders)[number]['returns'][number] } | null = null;
    for (const order of db.orders) {
      const ret = order.returns.find((r) => r.id === req.params.returnId);
      if (ret) { found = { order, ret }; break; }
    }
    if (!found) fail(404, 'NOT_FOUND', 'Return request not found.');
    const { order, ret } = found;
    if (ret.status !== 'REQUESTED') fail(409, 'CONFLICT', `Return already ${ret.status.toLowerCase()}.`);

    if (decision === 'reject') {
      ret.status = 'REJECTED';
      ret.decisionReason = str(b.reason, 'Reason', { optional: true, max: 500 }) ?? 'Rejected after review';
      ret.decidedAt = nowIso();
      audit(staff.name, staff.role, 'RETURN_REJECTED', order.id, `Return on ${order.number} rejected`, String(res.locals.rid));
      persist();
      return ok(res, { order, ret });
    }
    if (decision !== 'approve') fail(422, 'VALIDATION', 'Decision must be approve or reject.');

    // Refund preview → execution: refundExecution permission is required to complete money movement.
    if (!PERMISSION_MATRIX[staff.role].refundExecution) {
      fail(403, 'FORBIDDEN', 'Your role can review returns but not execute refunds. Ask FINANCE/ADMIN to complete the refund.');
    }
    const disposition = str(b.disposition, 'Stock disposition')!;
    if (!['RESTOCK', 'DAMAGED', 'DESTROY'].includes(disposition)) fail(422, 'VALIDATION', 'Disposition must be RESTOCK, DAMAGED or DESTROY.');

    // Refund amount: sum of returned line values (proportional partial refunds supported).
    let amount = 0;
    for (const item of ret.items) {
      const line = order.lines.find((l) => l.id === item.lineId)!;
      const unit = Math.round(line.lineTotalCents / line.quantity);
      amount += unit * item.quantity;
      line.refundedQty += item.quantity;
    }
    if (b.amountCents != null) {
      const custom = int(b.amountCents, 'Refund amount', { min: 0 })!;
      if (custom > order.totalCents - order.refunds.reduce((s, r) => s + (r.status === 'SUCCEEDED' ? r.amountCents : 0), 0)) {
        fail(422, 'VALIDATION', 'Refund exceeds the remaining refundable amount.');
      }
      amount = custom;
    }

    const payment = order.payments.find((p) => p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED');
    const refund = {
      id: nextId('ref'), orderId: order.id, paymentId: payment?.id ?? '',
      amountCents: amount, status: 'SUCCEEDED' as const,
      reason: ret.items.map((i) => i.reason).filter(Boolean)[0] ?? 'Approved return',
      requestedBy: `${staff.name} (${staff.role})`,
      creditNoteNumber: nextDocNumber('CREDIT_NOTE'),
      disposition: disposition as 'RESTOCK' | 'DAMAGED' | 'DESTROY',
      createdAt: nowIso(), resolvedAt: nowIso(),
    };
    order.refunds.unshift(refund);
    ret.status = 'COMPLETED';
    ret.stockDisposition = disposition as 'RESTOCK' | 'DAMAGED' | 'DESTROY';
    ret.refund = refund;
    ret.decisionReason = str(b.reason, 'Reason', { optional: true, max: 500 });
    ret.decidedAt = nowIso();
    if (payment) {
      payment.refundedCents += amount;
      payment.status = payment.refundedCents >= payment.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    }
    order.paymentStatus = order.refunds.reduce((s, r) => s + (r.status === 'SUCCEEDED' ? r.amountCents : 0), 0) >= order.totalCents
      ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    // Stock disposition is explicit: RESTOCK returns saleable units; DAMAGED/DESTROY never do.
    if (disposition === 'RESTOCK') {
      for (const item of ret.items) {
        const line = order.lines.find((l) => l.id === item.lineId)!;
        moveInventory(line.skuId, { onHand: item.quantity }, 'RETURN_RESTOCK', order.number, `Return ${ret.id} restocked`, staff.name);
      }
    } else {
      for (const item of ret.items) {
        const line = order.lines.find((l) => l.id === item.lineId)!;
        moveInventory(line.skuId, {}, 'RETURN_DISPOSED', order.number, `Return ${ret.id} disposed (${disposition}) — no saleable stock change`, staff.name);
      }
    }

    // Loyalty reversal (proportional, sample policy): reverse earnings for refunded value.
    if (order.customerId && amount > 0) {
      const reversal = Math.floor((amount / Math.max(order.totalCents, 1)) * (order.coinsEarnedAvailable + order.coinsEarnedPending));
      if (reversal > 0) {
        if (order.coinsEarnedPending >= reversal) {
          addLoyalty(order.customerId, 'EARN_REVERSAL', -reversal, 0, order.number, 'Proportional earning reversal on refund (sample policy)');
          order.coinsEarnedPending -= reversal;
        } else {
          const fromPending = order.coinsEarnedPending;
          addLoyalty(order.customerId, 'EARN_REVERSAL', -fromPending, -(reversal - fromPending), order.number, 'Proportional earning reversal on refund (sample policy)');
          order.coinsEarnedPending = 0;
          order.coinsEarnedAvailable -= reversal - fromPending;
        }
      }
    }

    const number = nextDocNumber('CREDIT_NOTE');
    order.documents.unshift({ id: nextId('doc'), type: 'CREDIT_NOTE', number, orderId: order.id, orderNumber: order.number, state: 'ISSUED', createdAt: nowIso(), createdBy: staff.name });
    audit(staff.name, staff.role, 'RETURN_COMPLETED', order.id,
      `Return on ${order.number} completed: refund $${(amount / 100).toFixed(2)}, disposition ${disposition}, credit note ${number}`,
      String(res.locals.rid));
    persist();
    ok(res, { order, ret });
  });

  // ---------------------------------------------------------------- documents
  app.get('/admin/documents', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'documents');
    const type = req.query.type ? String(req.query.type) : undefined;
    const items = db.orders.flatMap((o) => o.documents.map((d) => ({ ...d, orderNumber: o.number, orderTotalCents: o.totalCents })));
    ok(res, { items: type ? items.filter((d) => d.type === type) : items });
  });

  app.get('/admin/documents/:id', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'documents');
    for (const order of db.orders) {
      const meta = order.documents.find((d) => d.id === req.params.id || d.number === req.params.id);
      if (meta) return ok(res, { meta, order });
    }
    fail(404, 'NOT_FOUND', 'Document not found.');
  });

  app.post('/admin/orders/:id/documents', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'documents');
    const order = getOrder(req.params.id);
    const type = str(req.body?.type, 'Type')! as DocumentType;
    if (!['ORDER_CONFIRMATION', 'INVOICE', 'RECEIPT', 'PACKING_SLIP', 'CREDIT_NOTE'].includes(type)) {
      fail(422, 'VALIDATION', 'Unknown document type.');
    }
    if (type === 'RECEIPT' && !order.payments.some((p) => p.status === 'SUCCEEDED')) {
      fail(409, 'CONFLICT', 'A receipt requires a successful payment.');
    }
    if (type === 'PACKING_SLIP' && !['PICKING', 'PICKED', 'PACKED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED'].includes(order.fulfilmentStatus)) {
      fail(409, 'CONFLICT', 'A packing slip requires the order to be in fulfilment.');
    }
    if (type === 'CREDIT_NOTE' && order.refunds.length === 0) {
      fail(409, 'CONFLICT', 'A credit note requires a refund.');
    }
    if (type === 'ORDER_CONFIRMATION' && !['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.paymentStatus)) {
      fail(409, 'CONFLICT', 'An order confirmation requires a confirmed order.');
    }
    const number = nextDocNumber(type);
    const meta = { id: nextId('doc'), type, number, orderId: order.id, orderNumber: order.number, state: 'ISSUED' as const, createdAt: nowIso(), createdBy: staff.name };
    order.documents.unshift(meta);
    audit(staff.name, staff.role, 'DOCUMENT_ISSUED', order.id, `${type} ${number} issued for ${order.number}`, String(res.locals.rid));
    persist();
    ok(res, { meta, order });
  });

  // ---------------------------------------------------------------- promotions & banners
  app.get('/admin/promotions', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'promotions');
    const skus = new Map(db.products.flatMap((p) => p.skus).map((s) => [s.id, s]));
    const products = new Map(db.products.map((p) => [p.id, p]));
    ok(res, {
      promotions: db.promotions.map((p) => {
        const sku = skus.get(p.skuId);
        const product = sku ? products.get(sku.productId) : undefined;
        return { ...p, skuCode: sku?.code, productName: product?.name, basePriceCents: sku?.priceCents };
      }),
      banners: db.banners.sort((a, b) => a.displayOrder - b.displayOrder),
    });
  });

  app.post('/admin/promotions', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'promotions');
    const b = req.body ?? {};
    const skuId = str(b.skuId, 'SKU')!;
    const salePriceCents = int(b.salePriceCents, 'Sale price', { min: 1 })!;
    const startsAt = str(b.startsAt, 'Start')!;
    const endsAt = str(b.endsAt, 'End')!;
    if (new Date(endsAt) <= new Date(startsAt)) fail(422, 'VALIDATION', 'End must be after start.');
    const sku = db.products.flatMap((p) => p.skus).find((s) => s.id === skuId);
    if (!sku) fail(404, 'NOT_FOUND', 'SKU not found.');
    if (salePriceCents >= sku.priceCents) fail(422, 'VALIDATION', 'Sale price must be below the base price.');
    const promo: Promotion = { id: nextId('promo'), skuId, salePriceCents, startsAt, endsAt, label: str(b.label, 'Label', { optional: true, max: 80 }) ?? 'Promotion', active: b.active !== false };
    // Apply to the SKU schedule as well so pricing reflects it immediately.
    sku.salePriceCents = salePriceCents;
    sku.saleStartsAt = startsAt;
    sku.saleEndsAt = endsAt;
    db.promotions.unshift(promo);
    audit(staff.name, staff.role, 'PROMOTION_CREATED', promo.id, `${sku.code} sale $${(salePriceCents / 100).toFixed(2)} ${startsAt.slice(0, 10)} → ${endsAt.slice(0, 10)}`, String(res.locals.rid));
    persist();
    ok(res, promo);
  });

  app.delete('/admin/promotions/:id', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'promotions');
    const promo = db.promotions.find((p) => p.id === req.params.id);
    if (!promo) fail(404, 'NOT_FOUND', 'Promotion not found.');
    db.promotions = db.promotions.filter((p) => p.id !== promo.id);
    const sku = db.products.flatMap((p) => p.skus).find((s) => s.id === promo.skuId);
    if (sku && sku.salePriceCents === promo.salePriceCents) {
      sku.salePriceCents = undefined; sku.saleStartsAt = undefined; sku.saleEndsAt = undefined;
    }
    audit(staff.name, staff.role, 'PROMOTION_DELETED', promo.id, `Promotion on ${sku?.code ?? promo.skuId} removed`, String(res.locals.rid));
    persist();
    ok(res, { ok: true });
  });

  app.put('/admin/banners/:id', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'promotions');
    const banner = db.banners.find((x) => x.id === req.params.id);
    if (!banner) fail(404, 'NOT_FOUND', 'Banner not found.');
    const b = req.body ?? {};
    if (b.title != null) banner.title = str(b.title, 'Title')!;
    if (b.subtitle !== undefined) banner.subtitle = str(b.subtitle, 'Subtitle', { optional: true, max: 120 });
    if (b.destinationPath != null) banner.destinationPath = str(b.destinationPath, 'Destination')!;
    if (b.displayOrder != null) banner.displayOrder = int(b.displayOrder, 'Order', { min: 0 })!;
    if (b.active != null) banner.active = b.active === true;
    audit(staff.name, staff.role, 'BANNER_UPDATED', banner.id, `Banner "${banner.title}" updated (active: ${banner.active})`, String(res.locals.rid));
    persist();
    ok(res, banner);
  });

  app.post('/admin/banners', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'promotions');
    const b = req.body ?? {};
    const banner = {
      id: nextId('banner'), title: str(b.title, 'Title')!, subtitle: str(b.subtitle, 'Subtitle', { optional: true, max: 120 }),
      glyph: str(b.glyph, 'Glyph', { optional: true }) ?? '🏷️', hue: int(b.hue, 'Hue', { min: 0, max: 360, optional: true }) ?? 210,
      destinationPath: str(b.destinationPath, 'Destination')!,
      displayOrder: int(b.displayOrder, 'Order', { min: 0, optional: true }) ?? db.banners.length + 1,
      active: b.active !== false,
    };
    db.banners.push(banner);
    audit(staff.name, staff.role, 'BANNER_CREATED', banner.id, `Banner "${banner.title}" created`, String(res.locals.rid));
    persist();
    ok(res, banner);
  });

  // ---------------------------------------------------------------- loyalty admin
  app.post('/admin/loyalty/:customerId/adjust', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'loyaltyAdjust');
    const customer = db.customers.find((c) => c.id === req.params.customerId);
    if (!customer) fail(404, 'NOT_FOUND', 'Customer not found.');
    const coins = int(req.body?.coins, 'Coins', { min: -100000, max: 100000 })!;
    if (coins === 0) fail(422, 'VALIDATION', 'Enter a non-zero coin adjustment.');
    const reason = str(req.body?.reason, 'Reason', { max: 300 })!;
    const before = loyaltyBalance(customer.id);
    const entry = addLoyalty(customer.id, 'MANUAL_ADJUSTMENT', 0, coins, `ADJ-${Date.now().toString(36)}`, reason);
    audit(staff.name, staff.role, 'LOYALTY_ADJUSTMENT', customer.id,
      `${coins >= 0 ? '+' : ''}${coins} coins for ${customer.email} (${before.available} → ${before.available + coins}) — ${reason}`,
      String(res.locals.rid));
    ok(res, { entry, balance: { ...before, available: before.available + coins } });
  });

  // ---------------------------------------------------------------- settings & staff & audit
  app.get('/admin/settings', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'settings');
    ok(res, {
      settings: db.settings,
      staff: db.staff,
      roleLabels: ROLE_LABELS,
      permissionMatrix: PERMISSION_MATRIX,
    });
  });

  app.put('/admin/settings', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'settings');
    const b = req.body ?? {};
    const s = db.settings;
    if (b.storeName != null) s.storeName = str(b.storeName, 'Store name', { max: 60 })!;
    if (b.tagline != null) s.tagline = str(b.tagline, 'Tagline', { max: 120 })!;
    if (b.shippingFlatCents != null) s.shippingFlatCents = int(b.shippingFlatCents, 'Shipping', { min: 0 })!;
    if (b.freeShippingThresholdCents != null) s.freeShippingThresholdCents = int(b.freeShippingThresholdCents, 'Threshold', { min: 0 })!;
    if (Array.isArray(b.excludedPostcodes)) s.excludedPostcodes = b.excludedPostcodes.map(String);
    if (b.timezone != null) s.timezone = str(b.timezone, 'Timezone', { max: 60 })!;
    if (b.featureFlags && typeof b.featureFlags === 'object') s.featureFlags = { ...s.featureFlags, ...b.featureFlags };
    if (Array.isArray(b.policyPages)) s.policyPages = b.policyPages;
    audit(staff.name, staff.role, 'SETTINGS_UPDATED', 'settings', 'Store settings updated', String(res.locals.rid));
    persist();
    ok(res, s);
  });

  app.put('/admin/staff/:id', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'staff');
    const target = db.staff.find((x) => x.id === req.params.id);
    if (!target) fail(404, 'NOT_FOUND', 'Staff member not found.');
    const b = req.body ?? {};
    if (b.role != null) {
      if (!Object.keys(PERMISSION_MATRIX).includes(b.role)) fail(422, 'VALIDATION', 'Unknown role.');
      target.role = b.role;
      audit(staff.name, staff.role, 'STAFF_ROLE_CHANGED', target.id, `${target.name} role → ${b.role}`, String(res.locals.rid));
    }
    if (b.active != null) target.active = b.active === true;
    persist();
    ok(res, target);
  });

  app.get('/admin/audit', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'audit');
    ok(res, db.audit.slice(0, 200));
  });

  app.get('/admin/permissions/me', (req, res) => {
    const auth = getAuth(req);
    if (!auth.staff) fail(401, 'UNAUTHENTICATED', 'Staff identity required.');
    ok(res, { staff: auth.staff, permissions: PERMISSION_MATRIX[auth.staff.role], roleLabels: ROLE_LABELS });
  });
}

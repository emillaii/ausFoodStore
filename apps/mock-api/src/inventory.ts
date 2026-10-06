import type { Express } from 'express';
import { db, audit, persist } from './db';
import { fail, getAuth, int, ok, requireStaff, str, nowIso } from './http';
import { availableOf, invOf, moveInventory } from './domain';

export function registerInventoryRoutes(app: Express): void {
  app.get('/admin/inventory', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'orders'); // read viewable by any order-facing role
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const lowOnly = req.query.low === '1';
    const rows = db.products.flatMap((p) =>
      p.skus
        .filter((s) => s.active)
        .map((s) => {
          const inv = invOf(s.id);
          const available = inv.onHand - inv.reserved - inv.allocated;
          return {
            ...inv,
            skuCode: s.code, productId: p.id, productName: p.name,
            optionSummary: Object.entries(s.optionValues).map(([k, v]) => `${k}: ${v}`).join(', ') || (s.packSize ?? ''),
            available,
            lowStock: available <= inv.lowStockThreshold,
          };
        }),
    );
    let filtered = rows;
    if (q) filtered = filtered.filter((r) => r.skuCode.toLowerCase().includes(q) || r.productName.toLowerCase().includes(q));
    if (lowOnly) filtered = filtered.filter((r) => r.lowStock);
    ok(res, { items: filtered, total: filtered.length });
  });

  app.get('/admin/inventory/:skuId/movements', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'orders');
    ok(res, db.stockMovements.filter((m) => m.skuId === req.params.skuId).slice(0, 200));
  });

  /**
   * Signed adjustment with mandatory reason. Rejects adjustments that would
   * take on-hand below reserved + allocated (reconciliation required) and
   * negative results — enforced in moveInventory.
   */
  app.post('/admin/inventory/:skuId/adjust', (req, res) => {
    const auth = getAuth(req);
    const staff = requireStaff(auth, 'inventoryAdjust');
    const sku = db.products.flatMap((p) => p.skus).find((s) => s.id === req.params.skuId);
    if (!sku) fail(404, 'NOT_FOUND', 'SKU not found.');
    const delta = int(req.body?.delta, 'Adjustment', { min: -100000, max: 100000 })!;
    if (delta === 0) fail(422, 'VALIDATION', 'Enter a non-zero signed adjustment.');
    const reason = str(req.body?.reason, 'Reason', { max: 300 })!;
    const reference = str(req.body?.reference, 'Reference', { optional: true, max: 60 });
    const inv = invOf(sku.id);
    const before = { onHand: inv.onHand, reserved: inv.reserved, allocated: inv.allocated };
    const updated = moveInventory(sku.id, { onHand: delta }, 'ADJUSTMENT', reference ?? 'MANUAL', reason, `${staff.name} (${staff.role})`);
    audit(staff.name, staff.role, 'STOCK_ADJUSTED', sku.id,
      `${sku.code}: on-hand ${before.onHand} → ${updated.onHand} (${delta >= 0 ? '+' : ''}${delta}) — ${reason}`,
      String(res.locals.rid));
    ok(res, {
      skuId: sku.id, before, after: { onHand: updated.onHand, reserved: updated.reserved, allocated: updated.allocated },
      availableBefore: before.onHand - before.reserved - before.allocated,
      availableAfter: updated.onHand - updated.reserved - updated.allocated,
    });
  });

  // Preview endpoint for the confirm dialog (§7.3).
  app.post('/admin/inventory/:skuId/preview', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'inventoryAdjust');
    const inv = invOf(req.params.skuId);
    const delta = int(req.body?.delta, 'Adjustment', { min: -100000, max: 100000, optional: true }) ?? 0;
    const projectedOnHand = inv.onHand + delta;
    const allowed = projectedOnHand >= inv.reserved + inv.allocated && projectedOnHand >= 0;
    ok(res, {
      current: { ...inv, available: availableOf(inv.skuId) },
      projected: { onHand: projectedOnHand, reserved: inv.reserved, allocated: inv.allocated, available: projectedOnHand - inv.reserved - inv.allocated },
      allowed,
      blockReason: !allowed && projectedOnHand < inv.reserved + inv.allocated
        ? 'On-hand would fall below reserved + allocated. Reconcile open reservations/allocations first.'
        : !allowed ? 'On-hand cannot go negative.' : null,
    });
  });
}

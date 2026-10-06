import type { Express } from 'express';
import { db } from './db';
import { fail, getAuth, ok, requireStaff } from './http';

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function registerReportRoutes(app: Express): void {
  app.get('/admin/reports/:type', (req, res) => {
    const auth = getAuth(req);
    requireStaff(auth, 'reports');
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86_400_000);
    const to = req.query.to ? new Date(String(req.query.to) + 'T23:59:59.999Z') : new Date();
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= from.getTime() && t <= to.getTime();
    };
    const paidStatuses = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];
    const paidOrders = db.orders.filter((o) => paidStatuses.includes(o.paymentStatus) && inRange(o.placedAt));

    switch (req.params.type) {
      case 'sales-by-date': {
        const map = new Map<string, { orders: number; revenueCents: number }>();
        for (const o of paidOrders) {
          const k = dayKey(o.placedAt);
          const row = map.get(k) ?? { orders: 0, revenueCents: 0 };
          row.orders += 1;
          row.revenueCents += o.totalCents;
          map.set(k, row);
        }
        return ok(res, {
          columns: ['orders', 'revenueCents'],
          rows: [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, v]) => ({ label, values: v })),
        });
      }
      case 'sales-by-sku': {
        const map = new Map<string, { productName: string; units: number; revenueCents: number }>();
        for (const o of paidOrders) {
          for (const l of o.lines) {
            const row = map.get(l.skuCode) ?? { productName: l.productName, units: 0, revenueCents: 0 };
            row.units += l.quantity;
            row.revenueCents += l.lineTotalCents;
            map.set(l.skuCode, row);
          }
        }
        return ok(res, {
          columns: ['productName', 'units', 'revenueCents'],
          rows: [...map.entries()].sort((a, b) => b[1].revenueCents - a[1].revenueCents)
            .map(([label, v]) => ({ label, values: v })),
        });
      }
      case 'order-status': {
        const map = new Map<string, number>();
        for (const o of db.orders) map.set(o.fulfilmentStatus, (map.get(o.fulfilmentStatus) ?? 0) + 1);
        return ok(res, { columns: ['count'], rows: [...map.entries()].map(([label, count]) => ({ label, values: { count } })) });
      }
      case 'refunds': {
        const map = new Map<string, { count: number; amountCents: number }>();
        for (const o of db.orders) {
          for (const r of o.refunds) {
            if (!inRange(r.createdAt)) continue;
            const k = dayKey(r.createdAt);
            const row = map.get(k) ?? { count: 0, amountCents: 0 };
            row.count += 1;
            row.amountCents += r.amountCents;
            map.set(k, row);
          }
        }
        return ok(res, { columns: ['count', 'amountCents'], rows: [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, v]) => ({ label, values: v })) });
      }
      case 'low-stock': {
        const rows = Object.values(db.inventory)
          .map((inv) => {
            const sku = db.products.flatMap((p) => p.skus).find((s) => s.id === inv.skuId)!;
            const product = db.products.find((p) => p.id === sku.productId)!;
            return {
              label: sku.code,
              values: {
                productName: product.name,
                onHand: inv.onHand, reserved: inv.reserved, allocated: inv.allocated,
                available: inv.onHand - inv.reserved - inv.allocated, threshold: inv.lowStockThreshold,
              },
            };
          })
          .filter((r) => (r.values.available as number) <= (r.values.threshold as number));
        return ok(res, { columns: ['productName', 'onHand', 'reserved', 'allocated', 'available', 'threshold'], rows });
      }
      case 'stock-movements': {
        const rows = db.stockMovements.slice(0, 100).map((m) => ({
          label: dayKey(m.createdAt),
          values: {
            skuId: m.skuId, type: m.type, reference: m.reference, reason: m.reason ?? '',
            onHand: m.after.onHand, delta: (m.deltas.onHand ?? 0) + (m.deltas.reserved ?? 0) + (m.deltas.allocated ?? 0),
            actor: m.actor,
          },
        }));
        return ok(res, { columns: ['skuId', 'type', 'reference', 'reason', 'onHand', 'delta', 'actor'], rows });
      }
      case 'coins': {
        const issued = new Map<string, number>();
        const redeemed = new Map<string, number>();
        for (const e of db.loyalty) {
          const k = dayKey(e.createdAt);
          if (e.deltaPending > 0 || e.deltaAvailable > 0) issued.set(k, (issued.get(k) ?? 0) + e.deltaPending + e.deltaAvailable);
          if (e.deltaAvailable < 0) redeemed.set(k, (redeemed.get(k) ?? 0) - e.deltaAvailable);
        }
        const keys = [...new Set([...issued.keys(), ...redeemed.keys()])].sort();
        return ok(res, {
          columns: ['issued', 'redeemed'],
          rows: keys.map((k) => ({ label: k, values: { issued: issued.get(k) ?? 0, redeemed: redeemed.get(k) ?? 0 } })),
        });
      }
      default:
        fail(404, 'NOT_FOUND', 'Unknown report type.');
    }
  });
}

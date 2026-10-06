import type {
  Address, AuditEvent, Banner, Cart, Category, CheckoutAttempt, Customer, DocumentMeta, Inventory, LoyaltyEntry,
  Order, Product, Promotion, Refund, ReturnRequest, Shipment, Sku, StaffUser, StockMovement, StoreSettings,
} from '@aus/contracts';

export interface Database {
  meta: { seededAt: string; version: number; orderSeq: number; docSeqs: Record<string, number> };
  settings: StoreSettings;
  staff: StaffUser[];
  customers: Customer[];
  addresses: Record<string, Address[]>;
  categories: Category[];
  products: Product[];
  inventory: Record<string, Inventory>;
  stockMovements: StockMovement[];
  carts: Record<string, Cart>;
  checkoutAttempts: CheckoutAttempt[];
  orders: Order[];
  loyalty: LoyaltyEntry[];
  promotions: Promotion[];
  banners: Banner[];
  audit: AuditEvent[];
  sessions: { token: string; customerId: string; createdAt: string }[];
}

export interface SeedCtx {
  now: number;
  iso: (msOffset: number) => string;
  products: Product[];
  inventory: Record<string, Inventory>;
  movements: StockMovement[];
  skuByCode: Map<string, import('@aus/contracts').Sku>;
  productById: Map<string, Product>;
  moveSeq: number;
}

/** Replay one inventory bucket change, recording an append-only movement row. */
export function applyMove(
  ctx: SeedCtx,
  skuId: string,
  deltas: { onHand?: number; reserved?: number; allocated?: number },
  type: StockMovement['type'],
  reference: string,
  atMs: number,
  reason?: string,
  actor = 'system (seed)',
): void {
  const inv = ctx.inventory[skuId];
  if (!inv) throw new Error(`unknown sku ${skuId}`);
  const before = { onHand: inv.onHand, reserved: inv.reserved, allocated: inv.allocated };
  inv.onHand += deltas.onHand ?? 0;
  inv.reserved += deltas.reserved ?? 0;
  inv.allocated += deltas.allocated ?? 0;
  inv.version += 1;
  if (before.onHand === inv.onHand && before.reserved === inv.reserved && before.allocated === inv.allocated) return;
  ctx.movements.push({
    id: `mov-${String(++ctx.moveSeq).padStart(4, '0')}`,
    skuId, type, deltas, before,
    after: { onHand: inv.onHand, reserved: inv.reserved, allocated: inv.allocated },
    reference, reason, actor, createdAt: ctx.iso(atMs),
  });
}

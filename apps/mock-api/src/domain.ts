import type {
  Address, CheckoutLineSnapshot, Customer, Inventory, LoyaltyEntry, LoyaltyEntryType, Order,
  OrderLine, Product, Sku, StockMovementType,
} from '@aus/contracts';
import { getEffectivePrice, taxComponentCents } from '@aus/contracts';
import { db, nextId, persist } from './db';
import { fail, nowIso } from './http';

export const findProduct = (id: string): Product | undefined => db.products.find((p) => p.id === id);
export const findProductBySlug = (slug: string): Product | undefined => db.products.find((p) => p.slug === slug);
export const findSku = (id: string): Sku | undefined => {
  for (const p of db.products) {
    const s = p.skus.find((x) => x.id === id);
    if (s) return s;
  }
  return undefined;
};
export const invOf = (skuId: string): Inventory =>
  db.inventory[skuId] ?? { skuId, onHand: 0, reserved: 0, allocated: 0, lowStockThreshold: 10, version: 0 };
export const availableOf = (skuId: string): number => {
  const i = invOf(skuId);
  return i.onHand - i.reserved - i.allocated;
};

/**
 * Single choke point for every inventory bucket mutation. Enforces the §8.2
 * invariants: no negative buckets, and (for direct on-hand adjustments) on-hand
 * may never drop below reserved + allocated. Append-only movement history.
 */
export function moveInventory(
  skuId: string,
  deltas: { onHand?: number; reserved?: number; allocated?: number },
  type: StockMovementType,
  reference: string,
  reason?: string,
  actor = 'system',
): Inventory {
  const inv = db.inventory[skuId];
  if (!inv) fail(404, 'NOT_FOUND', `Unknown SKU ${skuId}.`);
  const before = { onHand: inv.onHand, reserved: inv.reserved, allocated: inv.allocated };
  const after = {
    onHand: before.onHand + (deltas.onHand ?? 0),
    reserved: before.reserved + (deltas.reserved ?? 0),
    allocated: before.allocated + (deltas.allocated ?? 0),
  };
  if (after.onHand < 0 || after.reserved < 0 || after.allocated < 0) {
    fail(409, 'CONFLICT', `Inventory buckets cannot go negative for ${skuId}.`, { before, requested: deltas });
  }
  if (type === 'ADJUSTMENT' && after.onHand < after.reserved + after.allocated) {
    fail(409, 'CONFLICT', 'Adjustment rejected: on-hand would fall below reserved + allocated. Reconcile open reservations or allocations first.', { before, requested: deltas });
  }
  inv.onHand = after.onHand;
  inv.reserved = after.reserved;
  inv.allocated = after.allocated;
  inv.version += 1;
  db.stockMovements.unshift({
    id: nextId('mov'), skuId, type, deltas,
    before, after, reference, reason,
    actor, createdAt: nowIso(),
  });
  persist();
  return inv;
}

export function loyaltyBalance(customerId: string): { available: number; pending: number; held: number } {
  let available = 0;
  let pending = 0;
  for (const e of db.loyalty) {
    if (e.customerId !== customerId) continue;
    available += e.deltaAvailable;
    pending += e.deltaPending;
  }
  const held = db.checkoutAttempts
    .filter((a) => a.customerId === customerId && (a.status === 'RESERVED' || a.status === 'PAYMENT_PENDING'))
    .reduce((sum, a) => sum + a.coinRedeemed, 0);
  return { available, pending, held };
}

export function addLoyalty(
  customerId: string, type: LoyaltyEntryType,
  deltaPending: number, deltaAvailable: number,
  reference: string, reason?: string,
): LoyaltyEntry {
  const balance = loyaltyBalance(customerId);
  if (balance.available + deltaAvailable < 0) {
    fail(409, 'CONFLICT', 'Loyalty adjustment would make the available balance negative.');
  }
  const entry: LoyaltyEntry = {
    id: nextId('lty'), customerId, type, deltaPending, deltaAvailable, reference, reason,
    expiresAt: db.settings.loyaltyExpiryDays
      ? new Date(Date.now() + db.settings.loyaltyExpiryDays * 86_400_000).toISOString()
      : undefined,
    createdAt: nowIso(),
  };
  db.loyalty.unshift(entry);
  persist();
  return entry;
}

export function effectiveUnitPrice(sku: Sku, customer?: Customer | null): number {
  return getEffectivePrice(sku, customer ?? undefined, db.settings).unitPriceCents;
}

export function snapshotLine(sku: Sku, quantity: number, customer?: Customer | null): CheckoutLineSnapshot {
  const product = findProduct(sku.productId)!;
  const unitPriceCents = effectiveUnitPrice(sku, customer);
  return {
    skuId: sku.id, productId: product.id, productName: product.name, skuCode: sku.code,
    optionSummary: Object.entries(sku.optionValues).map(([k, v]) => `${k}: ${v}`).join(', ') || (sku.packSize ?? ''),
    packSize: sku.packSize, imageGlyph: product.imageGlyph, imageHue: product.imageHue,
    unitPriceCents, quantity, taxClass: sku.taxClass,
    lineTotalCents: unitPriceCents * quantity, availableAtQuote: availableOf(sku.id),
  };
}

export function orderLineFromSnapshot(s: CheckoutLineSnapshot): OrderLine {
  return {
    id: nextId('ln'), skuId: s.skuId, skuCode: s.skuCode, productId: s.productId,
    productName: s.productName, optionSummary: s.optionSummary, packSize: s.packSize,
    imageGlyph: s.imageGlyph, imageHue: s.imageHue, unitPriceCents: s.unitPriceCents,
    quantity: s.quantity, taxClass: s.taxClass,
    taxCents: taxComponentCents(s.lineTotalCents, s.taxClass, db.settings.gstRate),
    lineTotalCents: s.lineTotalCents, pickedQty: 0, shippedQty: 0, refundedQty: 0, exception: 'NONE',
  };
}

export interface CartTotals {
  subtotalCents: number; coinDiscountCents: number; manualDiscountCents: number; shippingCents: number;
  totalCents: number; gstIncludedCents: number; coinsEarned: number; deliverySupported: boolean;
}

export function computeAttemptTotals(
  lines: CheckoutLineSnapshot[],
  opts: { coinRedeemed: number; manualDiscountCents?: number; address?: Pick<Address, 'postcode'> | null; customer?: Customer | null },
): CartTotals {
  const s = db.settings;
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const coinDiscountCents = Math.min(Math.floor(opts.coinRedeemed / s.coinsPerDollarValue * 100), subtotalCents);
  const manualDiscountCents = opts.manualDiscountCents ?? 0;
  const afterDiscounts = Math.max(0, subtotalCents - coinDiscountCents - manualDiscountCents);
  const supported = opts.address ? !s.excludedPostcodes.includes(opts.address.postcode.trim()) : true;
  let shippingCents = 0;
  if (opts.address) {
    shippingCents = afterDiscounts >= s.freeShippingThresholdCents ? 0 : s.shippingFlatCents;
  }
  const gstIncludedCents = lines.reduce(
    (sum, l) => sum + taxComponentCents(l.lineTotalCents, l.taxClass, s.gstRate), 0,
  );
  return {
    subtotalCents, coinDiscountCents, manualDiscountCents, shippingCents,
    totalCents: afterDiscounts + (shippingCents > 0 ? shippingCents : 0),
    gstIncludedCents, coinsEarned: Math.floor(afterDiscounts / 100) * s.coinsPerDollar,
    deliverySupported: supported,
  };
}

export function computeOrderTotals(order: Order): CartTotals {
  return computeAttemptTotals(
    order.lines.map((l) => ({ ...l, availableAtQuote: 0 })),
    { coinRedeemed: order.coinsRedeemed, manualDiscountCents: order.manualDiscountCents, address: order.shippingAddress, customer: null },
  );
}

export function publicProduct(product: Product, customer?: Customer | null) {
  const skus = product.skus
    .filter((s) => s.active)
    .map((s) => {
      const price = getEffectivePrice(s, customer ?? undefined, db.settings);
      const available = availableOf(s.id);
      return {
        ...s,
        effectivePrice: price,
        available,
        lowStock: available > 0 && available <= invOf(s.id).lowStockThreshold,
      };
    });
  return {
    id: product.id, slug: product.slug, name: product.name, brand: product.brand,
    description: product.description, specs: product.specs, imageGlyph: product.imageGlyph,
    imageHue: product.imageHue, categoryIds: product.categoryIds, status: product.status,
    skus, requiresVariant: skus.length > 1,
  };
}

export function categorySlug(id: string): string | undefined {
  return db.categories.find((c) => c.id === id)?.slug;
}

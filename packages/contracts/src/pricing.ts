import type { Address, Customer, Product, Sku, StoreSettings, TaxClass } from './models';

/**
 * Deterministic pricing (brief §8.3). Precedence for the effective unit price:
 *   1. Scheduled sale price (if now within the sale window)
 *   2. Member price (only for signed-in customers, when the setting is enabled)
 *   3. Base price
 * The server is authoritative; UI values are previews only.
 */
export interface EffectivePrice {
  unitPriceCents: number;
  previousPriceCents?: number;
  memberPriceApplied: boolean;
  saleApplied: boolean;
}

export function isSaleActive(sku: Sku, now = new Date()): boolean {
  if (sku.salePriceCents == null) return false;
  if (sku.saleStartsAt && now < new Date(sku.saleStartsAt)) return false;
  if (sku.saleEndsAt && now > new Date(sku.saleEndsAt)) return false;
  return sku.salePriceCents < sku.priceCents;
}

export function getEffectivePrice(
  sku: Sku,
  customer?: Pick<Customer, 'member'> | null,
  settings?: Pick<StoreSettings, 'memberPriceEnabled'>,
  now = new Date(),
): EffectivePrice {
  if (isSaleActive(sku, now)) {
    return { unitPriceCents: sku.salePriceCents!, previousPriceCents: sku.priceCents, memberPriceApplied: false, saleApplied: true };
  }
  if (customer?.member && settings?.memberPriceEnabled !== false && sku.memberPriceCents != null && sku.memberPriceCents < sku.priceCents) {
    return { unitPriceCents: sku.memberPriceCents, previousPriceCents: sku.priceCents, memberPriceApplied: true, saleApplied: false };
  }
  return { unitPriceCents: sku.priceCents, memberPriceApplied: false, saleApplied: false };
}

/** GST in Australia is inclusive in displayed prices. 10/11 of a GST-inclusive amount is the GST content. */
export function taxComponentCents(amountCents: number, taxClass: TaxClass, gstRate: number): number {
  if (taxClass !== 'GST' || gstRate <= 0) return 0;
  return Math.round(amountCents - amountCents / (1 + gstRate));
}

export interface CartPricingInput {
  lines: { unitPriceCents: number; quantity: number; taxClass: TaxClass }[];
  coinRedeemed: number;
  shippingAddress?: Pick<Address, 'postcode'> | null;
  customer?: Pick<Customer, 'member'> | null;
}

export interface CartPricingResult {
  subtotalCents: number;
  coinDiscountCents: number;
  shippingCents: number;
  gstIncludedCents: number;
  gstFreeSubtotalCents: number;
  totalCents: number;
  coinsEarned: number;
}

/**
 * Calculation order (brief §8.3): unit price → line totals → coin redemption → shipping → tax.
 * Coin redemption applies to the merchandise subtotal; shipping is charged on the remainder.
 */
export function computeTotals(input: CartPricingInput, settings: StoreSettings): CartPricingResult {
  const subtotalCents = input.lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const maxCoinValue = Math.floor((input.coinRedeemed / settings.coinsPerDollarValue) * 100);
  const coinDiscountCents = Math.min(maxCoinValue, subtotalCents);
  const afterCoins = subtotalCents - coinDiscountCents;

  let shippingCents = 0;
  if (input.shippingAddress) {
    shippingCents = afterCoins >= settings.freeShippingThresholdCents ? 0 : settings.shippingFlatCents;
    if (settings.excludedPostcodes.includes(input.shippingAddress.postcode)) shippingCents = -1; // unsupported sentinel
  }

  const gstIncludedCents = input.lines.reduce(
    (sum, l) => sum + taxComponentCents(l.unitPriceCents * l.quantity, l.taxClass, settings.gstRate),
    0,
  );
  const totalCents = afterCoins + (shippingCents > 0 ? shippingCents : 0);
  const coinsEarned = Math.floor(afterCoins / 100) * settings.coinsPerDollar;
  return {
    subtotalCents,
    coinDiscountCents,
    shippingCents: shippingCents < 0 ? 0 : shippingCents,
    gstIncludedCents,
    gstFreeSubtotalCents: subtotalCents - gstIncludedCents,
    totalCents,
    coinsEarned,
  };
}

export function formatAud(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}$${dollars}.${rem}`;
}

export function coinsValueCents(coins: number, settings: Pick<StoreSettings, 'coinsPerDollarValue'>): number {
  return Math.floor((coins / settings.coinsPerDollarValue) * 100);
}

export function deliverySupported(postcode: string, settings: Pick<StoreSettings, 'excludedPostcodes'>): boolean {
  return !settings.excludedPostcodes.includes(postcode.trim());
}

export function availabilityOf(product: Product): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  const anyStock = product.skus.some((s) => s.active);
  if (!anyStock) return 'OUT_OF_STOCK';
  return 'IN_STOCK';
}

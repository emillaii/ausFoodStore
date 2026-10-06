/** Response view schemas shared by the service client and both front-ends. */
import type {
  Address, Banner, Category, CheckoutAttempt, CheckoutLineSnapshot, Customer, LoyaltyEntry, Order, Product, Sku,
} from './models';

export type CustomerPublic = Omit<Customer, 'password'> & { addressCount: number };

export interface EffectivePriceView {
  unitPriceCents: number;
  previousPriceCents?: number;
  saleApplied: boolean;
  memberPriceApplied: boolean;
}

export interface SkuView extends Sku {
  effectivePrice: EffectivePriceView;
  available: number;
  lowStock: boolean;
}

export interface ProductView extends Omit<Product, 'skus'> {
  skus: SkuView[];
  requiresVariant: boolean;
  related?: ProductView[];
  category?: { slug: string; name: string } | null;
}

export interface CartLineUnavailable {
  skuId: string;
  quantity: number;
  unavailable: true;
  reason: string;
}

export interface CartLineAvailable {
  skuId: string;
  quantity: number;
  unavailable: false;
  productId: string;
  slug: string;
  productName: string;
  skuCode: string;
  optionSummary: string;
  imageGlyph: string;
  imageHue: number;
  packSize?: string;
  unitPriceCents: number;
  previousPriceCents?: number;
  lineTotalCents: number;
  available: number;
  inStock: boolean;
  lowStock: boolean;
  earnCoins: number;
  saleApplied: boolean;
  memberPriceApplied: boolean;
}

export type CartLineView = CartLineUnavailable | CartLineAvailable;

export interface CartView {
  ownerKey: string;
  version: number;
  lines: CartLineView[];
  subtotalCents: number;
  itemCount: number;
  coinsBalance: { available: number; pending: number; held: number } | null;
  freeShippingThresholdCents: number;
  shippingFlatCents: number;
}

export interface HomeView {
  storeName: string;
  tagline: string;
  banners: Banner[];
  topCategories: Category[];
  deals: ProductView[];
  memberSpecials: ProductView[];
  popular: ProductView[];
  isNew: ProductView[];
  freeShippingThresholdCents: number;
}

export interface ListingResponse {
  items: ProductView[];
  total: number;
  page: number;
  pageSize: number;
  brands: string[];
  category: string | null;
  sort: string;
}

export interface SuggestionsResponse {
  products: { slug: string; name: string; brand?: string; glyph: string; hue: number }[];
  categories: { slug: string; name: string }[];
}

export interface TotalsView {
  subtotalCents: number;
  coinDiscountCents: number;
  manualDiscountCents?: number;
  shippingCents: number;
  totalCents: number;
  gstIncludedCents: number;
  coinsEarned: number;
  deliverySupported: boolean;
}

export interface CheckoutQuoteResponse {
  lines: CheckoutLineSnapshot[];
  totals: TotalsView;
  stockIssues: { skuId: string; productName: string; available: number; requested: number }[];
  deliverySupported: boolean;
  coinsBalance: { available: number; pending: number; held: number } | null;
  maxRedeemableCoins: number;
}

export interface AttemptResponse {
  attempt: CheckoutAttempt;
  serverTime?: string;
}

export interface BeginCheckoutResponse extends AttemptResponse {
  reused: boolean;
}

export interface PayResponse {
  attempt: CheckoutAttempt;
  order: Order | null;
  duplicate?: boolean;
  pending?: boolean;
  declined?: boolean;
  reconciled?: boolean;
  exception?: boolean;
}

export interface AuthResponse {
  customer: CustomerPublic;
  token: string;
}

export interface LoyaltyResponse {
  balance: { available: number; pending: number; held: number };
  transactions: LoyaltyEntry[];
  rules: { coinsPerDollar: number; coinsPerDollarValue: number; redemptionStep: number; note: string };
}

export interface MergeCartResponse {
  notes: string[];
  cart?: CartView;
}

export interface ReorderResponse {
  added: string[];
  unavailable: { name: string; reason: string }[];
  cart: CartView;
}

export interface AddressListResponse extends Array<Address> {}

export interface AdminProductListResponse {
  items: (Product & { skus: (Sku & { available: number })[] })[];
  total: number;
  page: number;
  pageSize: number;
}

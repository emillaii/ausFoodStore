/**
 * Domain model for the Aus Food Store commerce platform.
 * All AUD money values are integer cents. Quantities are integers.
 */

export type UUID = string;

export type Role = 'ADMIN' | 'ORDER_STAFF' | 'WAREHOUSE' | 'CUSTOMER_SERVICE' | 'FINANCE';

export interface PermissionMatrix {
  products: boolean;
  categories: boolean;
  inventoryAdjust: boolean;
  orders: boolean;
  manualOrders: boolean;
  fulfilment: boolean;
  customers: boolean;
  returns: boolean;
  refundExecution: boolean;
  documents: boolean;
  promotions: boolean;
  loyaltyAdjust: boolean;
  reports: boolean;
  settings: boolean;
  staff: boolean;
  audit: boolean;
}

/** ---------- People ---------- */

export interface Address {
  id: UUID;
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  suburb: string;
  state: string;
  postcode: string;
  country: 'AU';
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

export interface ConsentRecord {
  marketing: boolean;
  analytics: boolean;
  changedAt: string;
}

export interface Customer {
  id: UUID;
  email: string;
  password: string; // DEMO ONLY — production uses Firebase Auth; never store raw passwords.
  firstName: string;
  lastName: string;
  phone?: string;
  member: boolean;
  state: 'ACTIVE' | 'SUSPENDED' | 'DELETION_REQUESTED';
  consentHistory: ConsentRecord[];
  notes: StaffNote[];
  createdAt: string;
}

export interface StaffNote {
  id: UUID;
  authorId: UUID;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface StaffUser {
  id: UUID;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

/** ---------- Catalogue ---------- */

export type TaxClass = 'GST' | 'GST_FREE';
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface Category {
  id: UUID;
  slug: string;
  name: string;
  parentId: UUID | null;
  displayOrder: number;
  active: boolean;
  imageGlyph?: string;
}

export interface Sku {
  id: UUID;
  code: string;
  productId: UUID;
  optionValues: Record<string, string>;
  packSize?: string;
  priceCents: number;
  memberPriceCents?: number;
  salePriceCents?: number;
  saleStartsAt?: string;
  saleEndsAt?: string;
  taxClass: TaxClass;
  active: boolean;
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface Product {
  id: UUID;
  slug: string;
  name: string;
  brand?: string;
  description: string;
  specs: ProductSpec[];
  imageGlyph: string;
  imageHue: number;
  categoryIds: UUID[];
  status: ProductStatus;
  skus: Sku[];
  createdAt: string;
  updatedAt: string;
}

/** ---------- Inventory ---------- */

export interface Inventory {
  skuId: UUID;
  onHand: number;
  reserved: number;
  allocated: number;
  lowStockThreshold: number;
  version: number;
}

export type StockMovementType =
  | 'SEED'
  | 'ADJUSTMENT'
  | 'RESERVATION_HOLD'
  | 'RESERVATION_COMMIT'
  | 'RESERVATION_RELEASE'
  | 'PICK_ALLOCATE'
  | 'SHORT_PICK_RELEASE'
  | 'DISPATCH'
  | 'RETURN_RESTOCK'
  | 'RETURN_DISPOSED'
  | 'CANCEL_RELEASE';

export interface StockMovement {
  id: UUID;
  skuId: UUID;
  type: StockMovementType;
  deltas: { onHand?: number; reserved?: number; allocated?: number };
  before: { onHand: number; reserved: number; allocated: number };
  after: { onHand: number; reserved: number; allocated: number };
  reference: string;
  reason?: string;
  actor: string;
  createdAt: string;
}

/** ---------- Cart & checkout ---------- */

export interface CartLine {
  skuId: UUID;
  quantity: number;
  addedAt: string;
}

export interface Cart {
  ownerKey: string;
  lines: CartLine[];
  version: number;
  updatedAt: string;
}

export type CheckoutAttemptStatus =
  | 'QUOTE'
  | 'RESERVED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'STOCK_EXCEPTION';

export interface CheckoutLineSnapshot {
  skuId: UUID;
  productId: UUID;
  productName: string;
  skuCode: string;
  optionSummary: string;
  packSize?: string;
  imageGlyph: string;
  imageHue: number;
  unitPriceCents: number;
  quantity: number;
  taxClass: TaxClass;
  lineTotalCents: number;
  availableAtQuote: number;
}

export interface CheckoutAttempt {
  id: UUID;
  ownerKey: string;
  customerId?: UUID;
  contact: { name: string; email: string; phone: string };
  shippingAddress: Address;
  billingAddress?: Address;
  lines: CheckoutLineSnapshot[];
  subtotalCents: number;
  memberDiscountCents: number;
  coinRedeemed: number;
  coinDiscountCents: number;
  shippingCents: number;
  taxCents: { gstIncludedCents: number; gstFreeCents: number };
  totalCents: number;
  status: CheckoutAttemptStatus;
  reservationExpiresAt?: string;
  reservationCommitted: boolean;
  paymentOutcome?: 'SUCCESS' | 'FAILED' | 'PENDING';
  idempotencyKey?: string;
  orderId?: UUID;
  createdAt: string;
}

/** ---------- Orders ---------- */

export type PaymentStatus =
  | 'UNPAID'
  | 'PENDING'
  | 'PAID'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'FAILED';

export type FulfilmentStatus =
  | 'DRAFT'
  | 'AWAITING_PAYMENT'
  | 'INVOICE_ISSUED'
  | 'READY_TO_PICK'
  | 'PICKING'
  | 'PICKED'
  | 'PACKED'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type OrderLineException = 'NONE' | 'SHORT_PICKED' | 'CANCELLED';

export interface OrderLine {
  id: UUID;
  skuId: UUID;
  skuCode: string;
  productId: UUID;
  productName: string;
  optionSummary: string;
  packSize?: string;
  imageGlyph: string;
  imageHue: number;
  unitPriceCents: number;
  quantity: number;
  taxClass: TaxClass;
  taxCents: number;
  lineTotalCents: number;
  pickedQty: number;
  shippedQty: number;
  refundedQty: number;
  exception: OrderLineException;
}

export interface ShipmentItem {
  lineId: UUID;
  quantity: number;
}

export interface Shipment {
  id: UUID;
  carrier: string;
  service: string;
  trackingNumber: string;
  items: ShipmentItem[];
  state: 'CREATED' | 'DISPATCHED' | 'CANCELLED';
  dispatchedAt?: string;
  createdAt: string;
}

export type PaymentMethod = 'CARD_DEMO' | 'OFFLINE' | 'PAYMENT_LINK';

export interface PaymentRecord {
  id: UUID;
  attemptId?: UUID;
  providerRef: string;
  method: PaymentMethod;
  amountCents: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'VOIDED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  refundedCents: number;
  recordedBy?: string;
  reference?: string;
  createdAt: string;
}

export interface Refund {
  id: UUID;
  orderId: UUID;
  paymentId: UUID;
  amountCents: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  reason: string;
  requestedBy: string;
  creditNoteNumber?: string;
  disposition?: 'RESTOCK' | 'DAMAGED' | 'DESTROY';
  createdAt: string;
  resolvedAt?: string;
}

export interface ReturnItemLine {
  lineId: UUID;
  quantity: number;
  reason: string;
}

export interface ReturnRequest {
  id: UUID;
  orderId: UUID;
  orderNumber: string;
  customerId?: UUID;
  customerName: string;
  customerEmail?: string;
  items: ReturnItemLine[];
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  decisionReason?: string;
  stockDisposition?: 'RESTOCK' | 'DAMAGED' | 'DESTROY';
  refund?: Refund;
  requestedBy: string;
  createdAt: string;
  decidedAt?: string;
}

export type DocumentType =
  | 'ORDER_CONFIRMATION'
  | 'INVOICE'
  | 'RECEIPT'
  | 'PACKING_SLIP'
  | 'CREDIT_NOTE';

export interface DocumentMeta {
  id: UUID;
  type: DocumentType;
  number: string;
  orderId: UUID;
  orderNumber: string;
  state: 'ISSUED' | 'VOIDED';
  createdAt: string;
  createdBy: string;
}

export interface Order {
  id: UUID;
  number: string;
  ownerKey: string;
  customerId?: UUID;
  guestAccessCode?: string;
  contact: { name: string; email: string; phone: string };
  lines: OrderLine[];
  shippingAddress: Address;
  billingAddress?: Address;
  paymentStatus: PaymentStatus;
  fulfilmentStatus: FulfilmentStatus;
  subtotalCents: number;
  coinDiscountCents: number;
  manualDiscountCents: number;
  shippingCents: number;
  totalCents: number;
  gstIncludedCents: number;
  coinsEarnedPending: number;
  coinsEarnedAvailable: number;
  coinsRedeemed: number;
  payments: PaymentRecord[];
  refunds: Refund[];
  shipments: Shipment[];
  documents: DocumentMeta[];
  returns: ReturnRequest[];
  internalNotes: StaffNote[];
  exception?: 'PAYMENT_AFTER_EXPIRY' | 'STOCK_UNAVAILABLE' | null;
  placedAt: string;
  createdBy?: string;
  updatedAt: string;
}

/** ---------- Loyalty ---------- */

export type LoyaltyEntryType =
  | 'EARN_PENDING'
  | 'EARN_AVAILABLE'
  | 'PENDING_MATURED'
  | 'REDEEM_HOLD'
  | 'REDEEM_COMMIT'
  | 'REDEEM_RELEASE'
  | 'EARN_REVERSAL'
  | 'REDEEM_RESTORE'
  | 'MANUAL_ADJUSTMENT'
  | 'EXPIRED';

export interface LoyaltyEntry {
  id: UUID;
  customerId: UUID;
  type: LoyaltyEntryType;
  deltaPending: number;
  deltaAvailable: number;
  reference: string;
  reason?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface LoyaltyBalance {
  customerId: UUID;
  available: number;
  pending: number;
  held: number;
}

/** ---------- Promotions ---------- */

export interface Promotion {
  id: UUID;
  skuId: UUID;
  salePriceCents: number;
  startsAt: string;
  endsAt: string;
  label: string;
  active: boolean;
}

export interface Banner {
  id: UUID;
  title: string;
  subtitle?: string;
  glyph: string;
  hue: number;
  destinationPath: string;
  displayOrder: number;
  active: boolean;
}

/** ---------- Audit & settings ---------- */

export interface AuditEvent {
  id: UUID;
  actor: string;
  actorRole?: Role;
  action: string;
  resource: string;
  summary: string;
  requestId: string;
  createdAt: string;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  currency: 'AUD';
  timezone: string;
  shippingFlatCents: number;
  freeShippingThresholdCents: number;
  excludedPostcodes: string[];
  gstRate: number; // 0.1
  coinsPerDollar: number; // sample: 1 coin per AUD 1
  coinsPerDollarValue: number; // 100 coins = AUD 1 => value of one coin in cents
  coinRedemptionStep: number; // must redeem in whole coins
  loyaltyExpiryDays: number;
  clickAndCollectEnabled: boolean;
  memberPriceEnabled: boolean;
  featureFlags: Record<string, boolean>;
  policyPages: { slug: string; title: string; body: string }[];
}

export interface ReportRow {
  label: string;
  values: Record<string, number | string>;
}

/** ---------- API envelopes ---------- */

export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STOCK_UNAVAILABLE'
  | 'PRICE_CHANGED'
  | 'RESERVATION_EXPIRED'
  | 'VERSION_CONFLICT'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'DELIVERY_UNSUPPORTED'
  | 'CONFLICT'
  | 'DEMO_ERROR';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

export interface ApiOk<T> {
  data: T;
  requestId: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

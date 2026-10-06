import type { Database, SeedCtx } from './types';
import { applyMove } from './types';
import { buildCatalog } from './catalog';
import { buildPeople } from './people';
import { buildOrders } from './orders';
import type { StoreSettings } from '@aus/contracts';

export type { Database } from './types';

export const DEMO_SETTINGS: StoreSettings = {
  storeName: 'Aus Meat Co.',
  tagline: 'Premium Australian meat & butcher goods, delivered',
  currency: 'AUD',
  timezone: 'Australia/Sydney',
  shippingFlatCents: 990,
  freeShippingThresholdCents: 7500,
  excludedPostcodes: ['2899', '0872'],
  gstRate: 0.1,
  coinsPerDollar: 1,
  coinsPerDollarValue: 100,
  coinRedemptionStep: 10,
  loyaltyExpiryDays: 365,
  clickAndCollectEnabled: false,
  memberPriceEnabled: true,
  featureFlags: { clickAndCollect: false, memberPricing: true, guestCheckout: true },
  policyPages: [
    { slug: 'delivery', title: 'Delivery', body: 'SAMPLE CONTENT — requires retailer approval.\n\nWe deliver to most Australian addresses. A flat $9.90 fee applies to orders under $75; orders of $75 or more ship free. Some remote postcodes are not serviceable in this demo (2899, 0872). Orders are packed from our single Sydney warehouse and dispatched with generic carriers; tracking numbers are entered manually by staff.' },
    { slug: 'returns', title: 'Returns & refunds', body: 'SAMPLE CONTENT — requires retailer approval.\n\nYou may request a return for eligible items within 14 days of delivery. Open the order in your account, choose the lines and quantities, and provide a reason. Our team reviews each request; approved refunds are issued to the original payment method. Damaged goods may be disposed of instead of returning to saleable stock. This demo simulates refunds and does not move real money.' },
    { slug: 'privacy', title: 'Privacy', body: 'SAMPLE CONTENT — requires retailer approval.\n\nThis prototype stores synthetic data only. A production deployment requires an approved privacy policy, data-retention schedule and consent workflow. You can request account deletion from Account → Settings in this demo; the request is recorded and reviewed by staff.' },
    { slug: 'loyalty', title: 'Loyalty coins', body: 'SAMPLE RULES — not customer-approved terms.\n\nEarn 1 coin per whole AUD 1 spent after discounts and coin redemption (shipping excluded). Paid orders create pending coins; coins become available when the order fully ships. 100 coins = $1 off a future order, redeemed in steps of 10. Refunds reverse earned coins proportionally and restore redeemed coins where policy allows.' },
  ],
};

export const DEMO_SCENARIOS: { id: string; title: string; description: string }[] = [
  { id: 's1', title: 'Publish → stock → buy', description: 'Admin creates/publishes a product and adds stock; it becomes discoverable and purchasable in the storefront.' },
  { id: 's2', title: 'Order lifecycle', description: 'A customer order appears in admin; staff pick, pack and dispatch; the customer sees shipment status.' },
  { id: 's3', title: 'Final-unit contention', description: 'White Truffle Oil has 1 unit, currently held by Noah\'s pending checkout. A second checkout attempt for it fails with STOCK_UNAVAILABLE.' },
  { id: 's4', title: 'Reservation expiry', description: 'Mia\'s expired checkout (ATT-MIA-EXPIRED) shows released stock and released coin holds in movement/ledger history.' },
  { id: 's5', title: 'Payment outcomes', description: 'At the simulated payment step you can choose success, decline, or pending. A late success after expiry triggers reconciliation.' },
  { id: 's6', title: 'Duplicate events', description: 'Replaying pay/dispatch calls is idempotent — no double effects.' },
  { id: 's7', title: 'Partial shipment/refund', description: 'ORD-1002 shows a partial shipment; its pending return demonstrates partial refund review.' },
  { id: 's8', title: 'Damaged return', description: 'ORD-1005\'s completed return used DAMAGED disposition — saleable stock unchanged (movement history proves it).' },
  { id: 's9', title: 'Snapshots', description: 'Editing products/addresses never alters historical orders — order lines are frozen snapshots.' },
  { id: 's10', title: 'Permissions', description: 'Switch roles in the admin demo panel; unauthorised modules return FORBIDDEN and a denied screen.' },
];

export function buildSeedDatabase(): Database {
  const now = Date.now();
  const iso = (msOffset: number) => new Date(now + msOffset).toISOString();
  const ctx: SeedCtx = {
    now, iso,
    products: [], inventory: {}, movements: [],
    skuByCode: new Map(), productById: new Map(), moveSeq: 0,
  };

  const { categories, products, inventory, promotions, banners } = buildCatalog(ctx);
  ctx.products = products;
  ctx.inventory = inventory;

  const { staff, customers, addresses, carts } = buildPeople(ctx);
  const { orders, attempts, loyalty, audit, docSeqs } = buildOrders(ctx, addresses);

  return {
    meta: { seededAt: iso(0), version: 1, orderSeq: 1006, docSeqs },
    settings: DEMO_SETTINGS,
    staff, customers, addresses, categories, products, inventory,
    stockMovements: ctx.movements,
    carts, checkoutAttempts: attempts, orders, loyalty, promotions, banners, audit,
    sessions: [],
  };
}

export { applyMove };

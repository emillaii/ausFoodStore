# Assumptions register (draft defaults — NOT customer-approved)

Per brief §3, these are prototype defaults stored in configuration (`packages/demo-data/src/index.ts`, `DEMO_SETTINGS`) and documented as assumptions. Sample values must not be presented as approved terms.

| Topic | Prototype default | Where configured |
|---|---|---|
| Branding | "Aus Food Store", original placeholder identity (🥑 glyph, green token palette), editable in Admin → Settings | `settings.storeName`, tokens.css |
| Language/currency | English, AUD, Australian address/number formatting | throughout |
| Product structure | Product → 1..n SKUs; multi-SKU products use a variant label (e.g. `Size:1kg`) | product editor |
| Guest checkout | Enabled; loyalty redemption requires an account | feature flag |
| Authentication | Demo email/password (all demo passwords `demo1234`); admin role switcher. Production: Firebase + API-derived permissions | mock-api/auth.ts |
| Payment | Simulated outcomes chosen by the tester: SUCCESS / FAILED / PENDING; late confirmation after expiry exercises reconciliation | checkout pay endpoint |
| Delivery | Flat $9.90, free ≥ $75 (sample), excluded demo postcodes 2899 / 0872; generic carrier + manual tracking | settings |
| Click & collect | Disabled behind feature flag | settings.featureFlags |
| Partial shipments | Supported and seeded (ORD-1002) | — |
| Loyalty | 1 coin per whole AUD 1 **after discounts**, coins pending until full shipment, 100 coins = $1, redemption steps of 10, refunds reverse earnings proportionally | settings + admin/returns decision |
| Member pricing | Optional per SKU; loses to an active sale price | pricing.ts |
| Promotions | Scheduled SKU sale prices + homepage banners; no coupon engine | admin promotions |
| Tax | SKU-level GST / GST-free classification (10% inclusive); sample food-staple classification | SKU taxClass |
| Returns | Customer request → staff decision → refund (permissioned) + explicit stock disposition + credit note | admin returns |
| Notifications | Mock only; UI states "no email sent" | — |
| Reporting timezone | Australia/Sydney (configurable) | settings |
| Staff permissions | DRAFT matrix in `packages/contracts/src/permissions.ts`; only enforced demo roles exist | permissions.ts |
| Reservation window | 15 minutes, server-authoritative | checkout.ts |
| Manual orders | Drafts/unpaid invoices do **not** reserve stock (prototype default §7.4); offline payment commits stock atomically | admin orders |
| Refund scope | Refund amount defaults to returned line value; never exceeds remaining refundable amount | admin returns |

## Open decisions required before production (from brief §3/§12)

Retailer name/assets, exact GST classifications + invoice details, loyalty caps/expiry/refund rules, delivery rates + carrier + serviceable postcodes, staff permission matrix, payment provider (Stripe was discussed), retention/privacy policies, restricted-product handling, and expected volumes.

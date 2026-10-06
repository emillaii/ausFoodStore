# API contract — mock commerce service

All endpoints return `{ data, requestId }` on success and `{ code, message, requestId, details? }` on failure (HTTP status matches the error class). Demo headers: `X-Session-Key` (guest cart), `Authorization: Bearer <token>` (customer), `X-Stand-Id`→`X-Staff-Id` (staff identity). Money is integer cents.

## Catalogue
| Operation | Contract |
|---|---|
| `GET /home` | Banners, top categories, deals, member specials (if member), popular, new. |
| `GET /categories` | Active categories (two-level hierarchy). |
| `GET /products?q&category&sort&inStock&sale&brand&page` | Paged product views with effective prices + availability; returns `brands` for filters. |
| `GET /search/suggestions?q` | Product + category suggestions (≥2 chars). |
| `GET /products/:slug` | Detail with variants, specs, related; 404 unless `ACTIVE`. |

## Cart (owner = customer session or `X-Session-Key`)
`GET /cart` · `POST /cart/lines {skuId, quantity}` (validates stock) · `PUT /cart/lines/:skuId {quantity}` (0 removes) · `DELETE /cart/lines/:skuId` · `POST /cart/merge` (guest→account on login; returns merge notes).

## Checkout
| Operation | Contract |
|---|---|
| `POST /checkout/quote {address?, coinRedeemed?}` | Authoritative preview; returns `stockIssues`, `deliverySupported`, `maxRedeemableCoins`. |
| `POST /checkout/attempts` | Creates attempt + 15-min reservation + coin hold. **Idempotent** via `idempotencyKey`. Atomic: any insufficient line → `STOCK_UNAVAILABLE`, nothing held. Unsupported postcode → `DELIVERY_UNSUPPORTED`. |
| `GET /checkout/attempts/:id` | Status + server time (client countdown is informational only). |
| `POST /checkout/attempts/:id/pay {outcome}` | `SUCCESS` \| `FAILED` \| `PENDING`. Re-validates prices → `PRICE_CHANGED`. `SUCCESS` after expiry re-secures stock/coins or creates an exception order with automatic refund. Duplicate `SUCCESS` returns the same order (`duplicate: true`). |
| `POST /checkout/attempts/:id/cancel` | Releases stock + coin holds. |
| `POST /checkout/complete-pending/:id` | Simulates the provider webhook confirming a pending payment. |

## Customer
`/auth/register · /auth/login · /auth/logout · /auth/me · PUT /customers/me (profile + consent history) · POST /customers/me/deletion-request · /customers/me/addresses CRUD · GET /loyalty (balance + immutable ledger + sample rules) · POST /orders/guest-lookup {orderNumber, email, accessCode}`.

## Orders (customer)
`GET /orders` (own only) · `GET /orders/:id` (ownership; guests via `?code=`) · `POST /orders/:id/reorder` (adds available equivalents, reports unavailable) · `POST /orders/:id/returns {items[{lineId, quantity, reason}]}` (validated against remaining returnable quantity).

## Admin (staff; permission-checked per endpoint)
| Group | Endpoints |
|---|---|
| Dashboard | `GET /admin/dashboard?from&to` — sales total (definition included), paid orders, awaiting-pick, pending refunds, low stock. |
| Products | `GET/POST /admin/products`, `GET/PUT /admin/products/:id` (optimistic `expectedUpdatedAt`), `POST /admin/products/:id/publish|archive|draft`. |
| Categories | `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/:id` (cycle + reference guards). |
| Inventory | `GET /admin/inventory`, `POST /admin/inventory/:skuId/preview`, `POST /admin/inventory/:skuId/adjust {delta, reason, reference?}` (reason required; below-reserved+allocated rejected), `GET /admin/inventory/:skuId/movements`. |
| Orders | `GET /admin/orders` (search, separate payment/fulfilment filters, sort), `GET /admin/orders/:id`, `POST /admin/orders` (manual draft), `PUT /admin/orders/:id` (draft only), `POST /admin/orders/:id/issue-invoice` (no stock/payment effects), `POST /admin/orders/:id/payment-link` (simulated pending), `POST /admin/orders/:id/offline-payment` (ADMIN/FINANCE; atomically validates availability + commits stock), `POST /admin/orders/:id/notes`, `POST /admin/orders/:id/cancel` (releases holds; refunds paid orders). |
| Fulfilment | `GET /admin/fulfilment/queue`, `start-picking`, `pick {lineId, quantity}` (short pick → exception), `exception/:lineId/resolve {action}`, `pack` (blocks open exceptions), `shipments` (≤ picked-unshipped), `shipments/:id/dispatch` (idempotent), `shipments/:id/cancel`. |
| Customers / Loyalty | `GET /admin/customers`, `GET /admin/customers/:id`, `POST /admin/customers/:id/notes`, `POST /admin/loyalty/:customerId/adjust {coins, reason}`. |
| Returns | `GET /admin/returns`, `POST /admin/returns/:id/decision {decision, disposition?, reason}` — approve requires `refundExecution`; disposition RESTOCK/DAMAGED/DESTROY; refund + credit note + proportional coin reversal. |
| Documents | `GET /admin/documents`, `GET /admin/documents/:id` (snapshot content), `POST /admin/orders/:id/documents {type}` (type-specific guards). |
| Promotions | `GET/POST/DELETE /admin/promotions`, `POST/PUT /admin/banners`. |
| Reports | `GET /admin/reports/:type?from&to` — sales-by-date, sales-by-sku, order-status, refunds, low-stock, stock-movements, coins. |
| Settings | `GET/PUT /admin/settings`, `PUT /admin/staff/:id` (role changes audited), `GET /admin/audit`, `GET /admin/permissions/me`. |
| Demo | `GET /demo/info`, `POST /demo/reset`, `GET /demo/state-summary`. **Fail closed in production.** |

## Error codes
`VALIDATION` (422) · `UNAUTHENTICATED` (401) · `FORBIDDEN` (403) · `NOT_FOUND` (404) · `STOCK_UNAVAILABLE` (409, line details) · `PRICE_CHANGED` (409, revised lines) · `RESERVATION_EXPIRED` (409) · `VERSION_CONFLICT` (409) · `PAYMENT_PENDING` (409) · `CONFLICT` (409) · `DELIVERY_UNSUPPORTED` (409) · `DEMO_ERROR` (500).

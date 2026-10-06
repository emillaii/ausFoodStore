# Architecture — Phase 1 prototype

## Build & rendering decision (recorded per brief §4.1)

- **React 18 + TypeScript, Vite SPAs (client-rendered).** No server rendering was added — the brief explicitly says not to add SSR solely for the prototype. Vite was chosen over Next.js because the prototype needs static bundling only; the rendering choice to revisit for production (SSR/prerendering for SEO) is documented in assumptions.md.
- **npm workspaces** monorepo; dependency versions pinned in `package-lock.json`.
- **@tanstack/react-query** as the central data-fetching layer (loading/error/retry/refetch states).
- **Hand-rolled CSS design tokens** (`packages/ui/src/tokens.css`) instead of a CSS framework — the design system is small and shared by both apps.

## One authoritative mock data store

Both apps run on different origins (5173 / 5174), so browser-localStorage state cannot be shared. Instead, `apps/mock-api` (Express, port 4000) is the **single authoritative store**:

- In-memory domain objects seeded from `@aus/demo-data`, persisted to `apps/mock-api/data/db.json` (debounced writes survive reloads).
- Both front-ends call it through a Vite dev proxy at `/api/*` — no CORS, one origin per app.
- `POST /demo/reset` (admin sidebar button or `npm run demo:reset`) rebuilds the seed; both apps see the reset on their next fetch.
- Mock behaviour lives **entirely in the mock API + adapter layer**, not in page components. Replacing the mock with the real AWS commerce API means pointing `packages/commerce-client` at the real base URL and replacing demo auth headers with Firebase tokens.

## Inventory model (§8.2)

```
available = on_hand − reserved − allocated        (all buckets ≥ 0)
```

Lifecycle enforced in `apps/mock-api/src/domain.ts` (`moveInventory`) and the checkout/fulfilment services:

| Event | Effect |
|---|---|
| Cart add | no inventory change |
| Payment attempt | `reserved += qty` (15-min expiry, idempotency key) |
| Payment success | reservation committed (stays in `reserved` until picking) |
| Picking starts | `reserved −= qty; allocated += qty` |
| Dispatch | `allocated −= qty; on_hand −= qty` (exactly once; duplicate dispatch is a no-op) |
| Cancellation/expiry | releases only the affected outstanding hold |
| Approved return | disposition `RESTOCK` → `on_hand += qty`; `DAMAGED`/`DESTROY` → no saleable stock change |

Every mutation writes an append-only `StockMovement` row with before/after per bucket. Adjustments that would take on-hand below reserved + allocated are rejected (reconciliation required). Late payment confirmation after expiry re-secures stock and coins atomically, or creates an exception order with an automatic void/refund.

## Money, tax and pricing

- Integer cents everywhere; quantities are integers.
- Effective price precedence (`packages/contracts/src/pricing.ts`): active scheduled **sale price** → **member price** (signed-in members) → base price.
- Authoritative totals: unit price → line totals → coin redemption → shipping → GST breakdown. GST is inclusive (10/11 of GST-inclusive amounts); sample classifications per SKU (`GST` / `GST_FREE`).
- Order lines, addresses and prices are **snapshots** — later catalogue/profile edits never change historical orders or documents.

## Auth model (demo)

- Customers: `POST /auth/login` returns a bearer token (demo passwords in seed; production = Firebase). `X-Session-Key` identifies guest carts; login merges the guest cart into the account cart and reports combined quantities.
- Staff: `X-Staff-Id` header from the admin role switcher. Every admin endpoint checks `PERMISSION_MATRIX[role]` server-side; production must derive this from the API per request.
- Guest order access requires order number + email + access code together.

## Frontends ↔ API

- `packages/commerce-client` exposes typed service groups (catalogue, cart, checkout, orders, fulfilment, admin…). Both apps construct one client with their own header provider.
- Structured errors: `{ code, message, requestId, details }` with codes from `ApiErrorCode` (VALIDATION, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, STOCK_UNAVAILABLE, PRICE_CHANGED, RESERVATION_EXPIRED, VERSION_CONFLICT, PAYMENT_PENDING…).
- Optimistic concurrency: admin product edits send `expectedUpdatedAt`; inventory carries `version`.

## Production boundaries (Phase 2)

Firebase Auth → commerce API (API Gateway + Lambda) → RDS Proxy → PostgreSQL, S3 for documents/images, background jobs for reservation expiry, notifications and document generation. The web app must never talk to PostgreSQL directly. See brief §4.2 and §10.

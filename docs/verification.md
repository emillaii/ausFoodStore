# Verification record

**Scope:** Phase 1 interactive prototype (brief §2.1, milestones M1–M4). Verified on Node 22 / macOS.

## Automated checks

| Check | Command | Expected |
|---|---|---|
| Type check (all apps + packages via app tsconfigs) | `npm run typecheck` | clean |
| Production build (both front-ends) | `npm run build` | clean |
| Invariant tests | `npm test` (mock-api/src/tests/invariants.ts) | all pass |

The invariant suite boots the real mock API and exercises, over HTTP: final-unit contention (two competing checkouts, one holds), idempotency-key reuse, duplicate payment (one order, one payment), reservation release on cancel, seeded expiry evidence, pick→pack→dispatch with **duplicate dispatch reducing stock exactly once**, over-quantity return rejection, CS-role blocked from executing refunds, warehouse blocked from stock adjustment, adjustment below reserved+allocated rejected, cross-customer order access denied, over-redemption of coins rejected.

## What is functional (not simulated)

- Full catalogue/cart/checkout/order/fulfilment/returns/loyalty/promotions/reports workflows end-to-end across both apps against the shared store.
- All inventory bucket transitions, append-only movement history, audit log, idempotency guards, optimistic version checks.
- Admin↔storefront consistency: publication, stock adjustment, orders, fulfilment status visible cross-app without touching fixtures.

## What is simulated / labelled Demo

- Authentication (demo passwords; no Firebase), payment capture (outcome chooser; no provider), documents (printable previews, watermarked Demo, no PDF storage), notifications (no email), guest order access (demo code mechanism), analytics (none).
- The demo API must fail closed in production deployments (`/demo/*` and demo headers removed).

## Manual browser verification

Performed with interactive browser tooling against `npm run dev` (screenshots in `docs/screenshots/`):

- **Storefront (390×844):** home (hero/categories/deals/popular) → product detail (sale price, variant-less quick add, stepper, related) → cart (2 lines, live pricing, coin earning, free-shipping gap) → guest checkout 4-step flow (contact → address → loyalty → review with service-calculated totals) → simulated payment dialog (attempt id, live reservation countdown, success/decline/pending/cancel) → order confirmation with scoped guest access code.
- **Admin (1440×900):** dashboard (sales/queues/low stock) → order detail for the order just placed in the storefront (cross-app visibility proven live) → fulfilment panel (start picking → per-line pick confirmation → pack with auto packing slip → shipment creation → dispatch) → order reaches **shipped** → products and inventory tables reflect the dispatch (on-hand reduced exactly once).
- **Customer account:** signed in as Mia — the fulfilled order shows paid + shipped; loyalty coins matured from pending to available on full shipment.

Defects found and fixed during this pass:
1. `/api` prefix not stripped by the mock API (all storefront calls 404'd) — added prefix-strip middleware.
2. Checkout quote rejected postcode-only addresses — quote now takes `{postcode}` only.
3. Stale quote error persisted after a successful re-quote — cleared on success.
4. Guest order detail was inaccessible from the confirmation page — the creating session can now view its guest order (still scoped; ID alone is never enough).
5. Cart was not cleared after a completed purchase — cart is now consumed on order creation.
6. Packing was possible with zero picked quantities — pack now requires every line picked/cancelled; modal state resets per open.

## Known limitations

1. Persistence is a JSON file — fine for a prototype; production needs PostgreSQL + transactions.
2. Node's single-threaded event loop stands in for database-level concurrency guarantees; final-unit contention is proven at the adapter level only (brief §9 explicitly notes production still requires DB-level tests).
3. Images are synthetic glyph tiles; no binary assets.
4. Reservation expiry uses a 15s sweeper + lazy checks; a 4-second "fast expiry" path exists only via direct data access, so the test suite verifies expiry through the seeded expired attempt + sweep on read.
5. Search is substring-based; production would use Postgres FTS or similar.
6. Admin is desktop-first (usable, not tuned, below 1280px — narrow-width recommendation: open the sidebar via ☰).

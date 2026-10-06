# Aus Food Store — Phase 1 prototype

An Australian single-retailer e-commerce platform prototype: a **mobile-first customer storefront** and a **desktop admin portal**, sharing one authoritative mock commerce API. Built from `PHASE_1_DEVELOPMENT_BRIEF.md` (interactive-prototype scope, §2.1).

> **Demo environment.** Authentication, payments, documents and notifications are simulated and clearly labelled. No real money, emails or cloud services are involved. Run `npm run demo:reset` any time to restore the seeded dataset.

## Quick start

```bash
npm install
npm run dev        # starts all three: mock API :4000, storefront :5173, admin :5174
```

- Storefront: http://localhost:5173
- Admin portal: http://localhost:5174
- Mock API health: http://localhost:4000/health

Reset demo data: `npm run demo:reset` (or the Reset button in the admin sidebar).

### Demo accounts

| Context | Identity | Password / notes |
|---|---|---|
| Customer (member) | `ava@example.com` | `demo1234` — richest order history, partial shipment, pending return |
| Customer | `liam@example.com` | `demo1234` — short-pick exception + refunded order |
| Customer (member) | `mia@example.com` | `demo1234` — expired checkout scenario |
| Admin staff | Sarah Chen (ADMIN) | chosen in the admin role switcher (top bar) |
| Other staff | Tom (orders), Raj (warehouse), Emily (customer service), Marcus (finance) | same switcher |

## Repository layout

```text
apps/
  storefront/   Customer web app (React 18 + Vite SPA, port 5173)
  admin/        Staff portal (React 18 + Vite SPA, port 5174)
  mock-api/     Authoritative mock commerce API (Express, port 4000, JSON persistence)
packages/
  contracts/      Domain types, error codes, pricing/permissions logic
  commerce-client/ Typed service client (fetch-based adapter — swap for HTTP/AWS later)
  demo-data/      Seed fixtures + scenario descriptions
  ui/             Design tokens + shared primitives
docs/
  architecture.md   Build/render decision, data flow, invariants
  api-contract.md   Service surface, errors, rules
  assumptions.md    Draft defaults register (not customer-approved)
  verification.md   What was verified, what is simulated, known limitations
```

## Verification

```bash
npm run typecheck   # TypeScript across all apps
npm run build       # production builds of both front-ends
npm test            # invariant tests (contention, idempotency, expiry, permissions, refunds)
```

Note: `npm test` resets the shared demo store as a side effect.

## What works end-to-end

1. Admin publishes a product and adds stock → it becomes purchasable in the storefront.
2. Customer carts and checks out (guest or signed-in) → order appears in admin.
3. Staff pick, pack, ship and dispatch → customer sees shipment status; coins mature.
4. Returns, partial refunds, damaged-stock disposition, credit notes.
5. Inventory invariants enforced at the service boundary (see `docs/architecture.md`).

See `docs/verification.md` for the full verified/simulated list and known limitations.

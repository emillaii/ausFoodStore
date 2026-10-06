# Aus Ecommerce — Web App and Admin Portal Development Brief

**Version:** 0.1 — first draft for AI implementation  
**Date:** 6 October 2026  
**Initial deliverable:** Working UI/UX prototype with connected mock data  
**Subsequent deliverable:** Production integrations and backend implementation

## 1. Purpose and source

Build an Australian single-retailer e-commerce platform, starting with a mobile-first responsive customer web app and a desktop admin portal. The shopping experience should use the discovery patterns discussed for HKTVmall: prominent search, category browsing, promotions, product grids, quick cart actions and visible loyalty rewards. Use an original, cleaner retail visual design.

This brief consolidates the SOW and UI/UX discussion in the ChatGPT project **Aus Ecommerce**, particularly [E-commerce Modules Pricing Estimate](https://chatgpt.com/g/g-p-6abf0071259881919e6afb6236b992e0-aus-ecommerce/c/6abdb109-b4a8-83ec-af17-bbfe02cb601e). Proposed implementation details and unresolved defaults below are draft decisions rather than customer-approved requirements.

The repository is currently empty. This document is a build brief, not an existing software implementation or a final contractual SOW.

## 2. Delivery boundaries

### 2.1 Build first: interactive prototype

Deliver two runnable applications with realistic seed data and functional workflows. All core buttons, forms, filters and navigation must work. Share one mock commerce data source so that admin changes appear in the storefront and customer orders appear in the admin portal.

Use asynchronous service interfaces for catalogue, cart, checkout, orders, inventory, loyalty and administration. Implement these through a mock adapter initially. Keep mock behaviour outside page components so a real HTTP adapter can replace it later.

The prototype must run locally without cloud accounts or payment credentials. Simulate authentication, payment outcomes, email events and document generation explicitly. Display a persistent **Demo environment** label and identify simulated payment/document actions. Keep demo controls out of the eventual production build.

### 2.2 Then: production implementation

Integrate Firebase Authentication, the AWS commerce API, PostgreSQL, real payment processing, private document storage and transactional notifications after the prototype is reviewed. Production readiness requires the backend rules and security checks in this brief; a browser-only mock is not sufficient.

### 2.3 Current scope

- Responsive customer storefront: discovery, products, cart, checkout and customer account.
- Desktop admin portal: catalogue, stock, customer and staff-created orders, fulfilment, documents, returns, loyalty, promotions, reporting and settings.
- One retailer, one initial inventory location, AUD transactions and Australian delivery addresses.
- Lightweight SKU inventory with an audit history.
- Loyalty coins as a discount/reward mechanism.
- Generic shipments with manual carrier and tracking entry initially.

### 2.4 Deferred or excluded

- Native iOS/Android apps; the reviewed web experience will inform later mobile development.
- Marketplace sellers, seller onboarding, commissions or tenant switching.
- Supplier management, purchase orders, goods receiving and supplier invoices.
- Full warehouse management, multiple warehouses, POS, ERP or accounting integrations.
- Real-money wallets, top-ups, transfers, withdrawals or customer credit accounts.
- Variable-weight groceries, substitutions, driver apps and delivery route optimisation.
- Direct carrier APIs until a provider and requirements are selected.
- Product reviews, subscriptions, recommendation engines and marketing automation.

## 3. Draft defaults and unresolved decisions

Implement these defaults for the prototype, store them in configuration, and document them as assumptions. Do not present sample policies or rates as customer-approved terms.

| Topic | Prototype default | Production decision needed |
|---|---|---|
| Branding | “Aus Food Store”; editable name and original placeholder identity | Retailer name, logo, colours and assets |
| Language/currency | English, AUD; Australian number/address formatting | Additional languages if required |
| Product structure | Product has one or more SKUs; simple products have one SKU | Actual variants, pack sizes and launch SKU count |
| Guest checkout | Enabled; loyalty requires an account | Retailer approval and guest order-access mechanism |
| Authentication | Demo guest/customer/staff identities | Firebase email method, Google Sign-In, staff access policy |
| Payment | Simulated success, failure and pending responses | One provider; Stripe was discussed as a candidate |
| Delivery | Configurable flat rate and free-shipping threshold, labelled sample values | Rates, serviceable postcodes and carrier |
| Click-and-collect | Disabled behind a feature flag | Required locations and collection workflow |
| Partial shipments | Supported in data model and demonstrated | Retailer approval |
| Loyalty | Sample: 1 coin per eligible AUD 1; 100 coins = AUD 1 discount | Earn/redemption rules, rounding, caps, exclusions, expiry and refund rules |
| Member pricing | Optional per SKU in demo data | Eligibility and interaction with promotions/coins |
| Promotions | Scheduled SKU sale price; no coupon engine | Campaign rules and discount stacking |
| Tax | SKU-level tax classification; sample taxable and GST-free items | Retailer-approved classifications, rates and invoice details |
| Returns | Demonstration request and staff review flow | Approved policy and refund permissions |
| Notifications | Mock event history | Email provider/templates; SMS and push deferred |
| Reporting timezone | Configurable store timezone; demo Australia/Sydney | Retailer timezone |
| Migration | Seed data only | Existing catalogue, customers and stock imports |

Before production, confirm restricted product handling, retailer business/invoice details, privacy and retention policies, staff permissions, service availability and expected transaction volumes. The software must provide editable policy pages and technical controls; policy text and legal/tax conclusions are outside this draft.

## 4. Architecture and code organisation

### 4.1 Frontend implementation constraints

Use React and TypeScript for both applications, with a shared component/token package and shared commerce contracts. The earlier discussion proposed React/Next.js; the implementing AI should record the rendering and build choice before scaffolding. Do not add server rendering solely for the prototype.

Customer pages must use reusable responsive components. Admin screens should share domain types and common form/table patterns but have their own layout. Use one consistent component system, typed form validation and a central data-fetching layer. Pin dependency versions and commit a lockfile.

Suggested organisation:

```text
apps/
  storefront/           Customer application
  admin/                Staff application
packages/
  ui/                   Shared primitives, tokens and icons
  contracts/            Domain types, request/response schemas
  commerce-client/      Service interfaces and mock/HTTP adapters
  demo-data/            Synthetic fixtures and reset utilities
docs/
  architecture.md
  api-contract.md
  assumptions.md
  verification.md
```

The mock adapter may use a small local server with persisted synthetic data. If separate browser origins are used, browser localStorage alone does not provide shared application state. Provide one authoritative mock data store, a reset command and predictable cross-app refresh behaviour.

### 4.2 Intended production boundaries

```text
Customer web / Admin portal
  ├─ Firebase Authentication → identity token
  └─ Commerce API → AWS API Gateway → Lambda
                                      └─ RDS Proxy → PostgreSQL

Supporting services:
S3: product images and private generated documents
Background jobs: reservation expiry, notifications and document generation
Monitoring: application logs, metrics and alerts
```

Core commerce data is intended for AWS Sydney (`ap-southeast-2`). The web hosting direction discussed was Firebase. Document the hosting configuration needed by the selected rendering mode: static hosting and a server-rendered application have different runtime needs. Verify current official provider documentation when implementing deployment.

No frontend may connect directly to PostgreSQL or contain server credentials. Internal user IDs must be independent of Firebase IDs. Staff authorisation and customer resource ownership must be enforced by the API.

## 5. Shared visual and interaction requirements

Create a small design system before building screens: semantic colours, typography, spacing, radii, shadows, buttons, fields, badges, cards, dialogs, drawers, tables and notification patterns.

- Use neutral backgrounds, clear product imagery and one primary brand colour. Sale and loyalty information should have consistent secondary treatments.
- Use original assets and synthetic product content. Provide image fallbacks and descriptive alternative text.
- Target customer widths of 390 and 430 pixels first; also verify 360, 768, 1024 and 1440 pixels.
- Customer breakpoints: mobile below 768px, tablet 768–1023px, desktop from 1024px.
- Admin target: 1280–1920px desktop. At narrow widths, show a usable desktop recommendation rather than broken forms.
- Customer tap targets should be at least 44px. Support keyboard navigation, visible focus, labelled controls, readable contrast and reduced motion.
- Provide loading, empty, error, retry, success, disabled and permission-denied states wherever relevant.
- Show inline field errors and preserve entered data after recoverable failures.
- Do not communicate stock, payment or fulfilment status through colour alone.
- Fixed headers, bottom navigation and sticky action bars must not overlap content, each other or the mobile keyboard. Respect device safe areas.
- Avoid dead links, decorative action buttons and unimplemented controls presented as functional.

## 6. Customer web app

### 6.1 Navigation and routes

Mobile bottom navigation: **Home / Categories / Search / Cart / Account**. Show active state and cart quantity badge. Keep prominent search in the shopping header. Desktop uses a full header with categories, search, account, coins and cart.

| Route | Screen | Required behaviour |
|---|---|---|
| `/` | Home | Hero campaign, category shortcuts, deals, optional member specials, popular and new products |
| `/categories` | Category browser | Mobile top-level list beside subcategory tiles; keyboard-accessible desktop equivalent |
| `/categories/:slug` | Product listing | Category context, sort, filters, pagination or load more, quick add |
| `/search?q=...` | Search | Suggestions, results, query state and no-result guidance |
| `/products/:slug` | Product detail | Images, selected SKU, pricing, availability, quantity and sticky add action |
| `/cart` | Cart | Edit quantities, remove lines, pricing changes, subtotal and checkout action |
| `/checkout` | Checkout | Contact, addresses, delivery, loyalty, review and payment |
| `/checkout/result/:id` | Checkout result | Pending/confirmed/failed/expired state based on service response |
| `/login`, `/register`, `/forgot-password` | Authentication | Demo flows initially; return to intended destination after login |
| `/account` | Account overview | Profile, orders, addresses, coins and preferences |
| `/account/orders` | Order history | Status, date, total, detail navigation and empty state |
| `/account/orders/:id` | Order detail | Items, amounts, payment, shipments, documents, return request and reorder |
| `/account/addresses` | Saved addresses | Create/edit/delete, defaults and validation |
| `/account/loyalty` | Coins | Available/pending balances, ledger and sample rules |
| `/account/settings` | Settings | Contact details, consent preferences and account deletion request |
| `/help`, `/policies/:slug` | Help/policies | Editable demo content and contact details |

Route names are proposed; equivalent route structures are acceptable if documented.

### 6.2 Discovery and product interaction

Keep the home page to approximately five to seven content sections. Campaign banners must link to meaningful product collections. Do not add seller names or vendor filters.

Product cards show image, product name, pack/variant, current AUD price, previous price when applicable, optional member price, estimated coin earning, availability and quick-add control. Price precedence must be defined in a shared pricing service.

For a single-SKU product, tapping add changes the control to minus/quantity/plus. Products requiring a variant open an accessible selector before adding. All product cards and cart lines must reflect the same cart state. Out-of-stock products cannot be added; quantity conflicts explain what changed.

Search uses a short debounce, ignores stale responses and supports keyboard selection. Provide product/category suggestions, recent searches and clear search. Filters include category, brand where available, price and in-stock status; sorting includes relevance, price and newest. Preserve query/filter state in the URL and restore list position on back navigation.

Product detail includes image gallery, description, specifications, delivery information, selected SKU, availability, quantity and related products. The selected SKU determines price and stock. Do not display review stars without real review data.

### 6.3 Cart and checkout

Persist the demo cart across reloads. On login, merge guest/account carts by SKU and explain any quantity adjustments. Adding to cart does not reserve stock.

Checkout sequence:

1. Guest contact or authenticated customer identification.
2. Shipping address and optional separate billing address.
3. Delivery availability and fee.
4. Optional account loyalty redemption.
5. Final review of items, prices, discount, shipping, tax breakdown and total.
6. Explicit payment action; service validates totals and starts a 15-minute stock reservation.
7. Payment result and order confirmation.

Show the reservation timer only after the service creates a reservation. Calculate it from server expiry time. A visual countdown reaching zero is not the authority for inventory release. Address editing and browsing the cart must not repeatedly create reservations.

Support success, declined, pending, cancelled, network failure and expired reservation scenarios. Disable repeated submission while a request is active and use idempotency keys in the service contract. Preserve a checkout attempt ID so reload/retry can recover its state.

Never mark payment successful merely because the browser reached the confirmation route. Pending payment displays a clear pending page with status refresh. Real integration must use provider-hosted/tokenised payment components.

If availability or prices change, show affected lines and require acceptance of revised totals before payment. Do not silently charge a new amount. Refuse delivery to unsupported areas with a clear message.

### 6.4 Account and post-purchase

Order detail displays separate payment and fulfilment states, shipment quantities/tracking, historical address/item snapshots and available documents. Reorder uses current stock and prices and identifies unavailable items.

Return requests select order lines, quantities and a reason. Show request history and staff decisions. Customer actions must not directly mark a refund as completed or return stock to saleable inventory.

Guest order access must use a secure scoped mechanism in production; knowing an order ID alone is insufficient. Customer pages must not expose other customers' resources.

## 7. Admin portal

### 7.1 Shell and navigation

Use a left sidebar, top bar, breadcrumbs and a wide content area. Prioritise searchable tables, saved filter state, concise status badges and context-specific actions. Show the current staff identity, role and environment.

Sidebar: **Dashboard / Products / Categories / Inventory / Orders / Fulfilment / Customers / Returns & Refunds / Documents / Promotions / Loyalty / Reports / Settings**.

### 7.2 Screen requirements

| Area | Required functionality |
|---|---|
| Dashboard | Date range, sales total with definition, paid orders, orders awaiting picking, pending refunds, low-stock list and links to operational queues |
| Products | Search SKU/name, filter category/status, pagination, create/edit, images, descriptions, category, SKU options, prices, tax class, active/draft/archived state |
| Categories | Create/edit hierarchy, display order, active status and image; prevent cycles and unsafe removal of referenced categories |
| Inventory | SKU, on-hand, reserved, allocated, available and low-stock threshold; adjustment action and movement history |
| Orders | Search order/customer/contact; filter date, payment and fulfilment separately; sortable table; create order and open detail |
| Order detail | Item/address snapshots, totals, payment history, documents, shipment history, audit timeline and permitted next actions |
| Manual order | Find or create customer, add SKUs, quantities and addresses, authorised discount, draft save, invoice and payment-link simulation |
| Fulfilment | Ready-to-pick queue, start picking, confirm per-line quantities, exception handling, packed state, packing slip and shipment creation |
| Customers | Search, contact details, account state, order history, saved addresses, loyalty and authorised notes |
| Returns/refunds | Request queue, selected quantities, decision/reason, refund preview, provider result, credit note and stock disposition |
| Documents | Order confirmation, invoice, receipt, packing slip and credit note; preview/download; distinct document states |
| Promotions | SKU sale prices and schedules; homepage banner/collection management; preview before publication |
| Loyalty | Customer ledger, pending/available balance, reasoned manual adjustment and configurable sample rules |
| Reports | Sales by date/SKU, order status counts, refunds, low stock, movements, coins issued/redeemed; date filters and CSV export |
| Settings | Store identity, delivery configuration, sample loyalty rules, staff roles, feature flags, policy content and integration status |

For prototype documents, generate a printable representation or sample PDF marked **Demo**; do not claim a real email was sent. CSV exports must escape spreadsheet formula-like cell content.

### 7.3 Inventory adjustment

Select a SKU, show current quantities, enter a signed integer adjustment and require a reason. Preview the resulting on-hand and available values before confirmation. Record actor, timestamp, reason, reference and before/after values for every affected inventory bucket.

Do not overwrite reserved or allocated quantities through a generic stock-edit form. Reject adjustments that make on-hand lower than reserved plus allocated; show an exception requiring reconciliation. Movement history is append-only. Reversals create compensating entries.

### 7.4 Staff-created order

An invoice can be issued before payment. Issuing it must not automatically mark payment received, deduct on-hand stock or create a shipment.

Prototype default: draft orders and unpaid issued invoices do not reserve stock. Starting a payment attempt uses the same temporary reservation rules as customer checkout. Approved offline payment recording must atomically validate availability and commit stock, record the reference and actor, and reject unavailable stock. An additional long-lived unpaid-order hold policy requires an explicit business decision.

Paid orders become eligible for picking. Lock financial/item snapshots after issue/confirmation; changes require an explicit revision, cancellation or credit-note workflow. Notes must be clearly separated from customer-facing content.

### 7.5 Picking, packing and shipping

When picking starts, transfer the relevant quantities from committed reserved stock to allocated stock. Record picked quantities by line. Short picks open an exception; staff cannot silently dispatch unavailable quantities.

Create shipments with carrier, service, tracking number and exact order-line quantities. Dispatch reduces on-hand and allocated by shipped quantities once. Support more than one shipment per order without exceeding remaining fulfilment quantities. Cancelling unshipped quantities releases their reservation/allocation.

### 7.6 Permissions

Implement a demo role switcher and a permission-denied screen. Proposed permissions are granular even if only ADMIN is enabled initially. Production permissions must come from the API, never the role switcher or browser state.

| Role | Draft access |
|---|---|
| ADMIN | All operational modules, staff permissions and configuration |
| ORDER_STAFF | Orders, manual order entry, customer lookup and permitted documents |
| WAREHOUSE | Picking, packing, shipments and read-only relevant inventory/order data |
| CUSTOMER_SERVICE | Customer/order lookup and return requests; no direct refund execution by default |
| FINANCE | Payments, refunds, financial documents and financial reports |

Stock adjustments, manual discounts, offline payment recording, refunds, loyalty adjustments and role changes require explicit permissions and audit records. The final permission matrix is subject to retailer confirmation.

## 8. Commerce rules and data contracts

### 8.1 Minimum domain entities

| Entity | Essential data |
|---|---|
| User/customer | Internal UUID, optional auth identity, contact details, state, consent history |
| Staff/permission | User ID, role/permissions and active state |
| Product/category | UUID, slug, name, description, images, hierarchy and publication state |
| SKU | UUID, unique SKU code, product ID, option values, pack size, pricing, tax class and active state |
| Inventory | SKU ID, on-hand, reserved, allocated, low-stock threshold and version |
| Stock movement | Bucket deltas, before/after, type, reference, reason, actor and timestamp |
| Cart | Owner/session, SKU lines, quantities and version |
| Checkout/reservation | Attempt ID, line holds, expiry, status, total snapshot and idempotency key |
| Order/order line | Number, owner/contact, item/address/price/tax snapshots, separate statuses and totals |
| Payment/refund | Provider reference, amount, status, unique event/reference and timestamps |
| Shipment/item | Carrier/tracking, shipment state, order line IDs and quantities |
| Return/item | Order line, quantity, reason, decision and stock disposition |
| Document | Type, unique number, order reference, state, historical content and private file reference |
| Loyalty ledger | Customer, coin delta, pending/available bucket, reference, reason, expiry and event key |
| Promotion/banner | Eligibility, sale price/schedule, display order, destination and publication state |
| Audit event | Actor, action, resource, change summary, timestamp and request ID |

### 8.2 Inventory invariants

```text
available = on_hand - reserved - allocated

Cart add:                 no inventory change
Payment attempt:          reserved += quantity (temporary)
Successful payment:       temporary reservation becomes committed
Picking starts:           reserved -= quantity; allocated += quantity
Dispatch:                 allocated -= quantity; on_hand -= quantity
Cancellation/expiry:      release only the affected outstanding hold
Approved saleable return: on_hand += accepted quantity
```

Reserved and allocated are mutually exclusive buckets for each unit. Available, reserved and allocated cannot become negative. Mutations must be atomic in production, including final-unit concurrency. Enforce version/conflict checks on concurrent admin edits.

If payment confirmation arrives after reservation expiry, reconcile atomically: commit inventory only if it can still be secured; otherwise place the order in a payment/stock exception and initiate the configured void/refund process. Do not allocate unavailable stock or report ordinary fulfilment success.

### 8.3 Money, tax, orders and refunds

- Represent AUD amounts in integer cents and quantities as integers for this scope.
- The service calculates authoritative totals, pricing eligibility, tax and discounts. Frontend values are previews.
- Define a deterministic calculation order: selected eligible unit price → eligible discount → coin redemption → shipping → tax breakdown according to approved rules. Record rounding rules and allocation of order-level discounts to lines.
- Display the amount the customer will pay and show any included tax breakdown without double-adding tax. Tax rates/classifications remain configurable.
- Snapshot order lines and addresses so later catalogue/profile edits do not change historical orders or documents.
- Separate order, payment, fulfilment and document state. Maintain permitted transition rules, not unrestricted status dropdowns.
- Refund requests cannot exceed the remaining refundable amount or eligible line quantity. Failed/pending provider refunds remain failed/pending in the UI.
- A refund, stock return and credit note are separate linked actions. Returned stock needs explicit disposition.
- Duplicate checkout requests, webhook events, dispatches, refunds and loyalty awards must not duplicate effects.

### 8.4 Loyalty

Paid orders create pending earned coins. Delivery/completion makes eligible coins available. Redemption uses available coins only and reserves them during checkout to prevent concurrent overspending. Expired/failed/cancelled attempts release coin holds.

Refunds must apply a documented proportional earning reversal and redeemed-coin restoration policy. Preserve an immutable ledger with unique event references. The prototype must demonstrate these effects using its labelled sample policy; production rules require retailer approval.

### 8.5 Service interface groups

Document typed inputs, outputs, validation, permissions and errors for these operations before real integration:

```text
Catalogue: listCategories, searchProducts, getProduct
Cart: getCart, setQuantity, removeLine, mergeCart
Checkout: quoteCheckout, beginPayment, getCheckoutStatus, cancelAttempt
Customer: getProfile, updateProfile, manageAddresses, listOrders, getOrder
Loyalty: getBalance, listTransactions
Returns: createReturnRequest, listReturnRequests
Admin catalogue: saveProduct, saveCategory, publishProduct, archiveProduct
Inventory: listInventory, adjustStock, listMovements
Orders: createDraft, updateDraft, issueInvoice, recordOfflinePayment
Fulfilment: startPicking, confirmPick, markPacked, createShipment, dispatch
Finance: requestRefund, getRefundStatus, getDocument
Administration: listCustomers, managePromotions, adjustCoins, getReports
Settings: getSettings, updateSettings, getPermissions, listAuditEvents
```

Use structured errors including validation, unauthenticated, forbidden, not found, stock unavailable, price changed, reservation expired, version conflict, payment pending and provider failure. Responses should include a request ID and enough safe detail to show useful recovery instructions.

## 9. Demo fixtures and scenarios

Provide approximately 30 synthetic products across at least six categories, with simple and multi-SKU products, sale/member prices, low stock and out-of-stock items. Use coherent fictional pack sizes, images and descriptions.

Seed customer identities, all demo staff roles, available/pending loyalty balances, stock history and orders in pending payment, paid, picking, packed, partial shipment, delivered and refunded states. Include a final-unit SKU, an expired checkout, a short-pick exception and a pending refund.

The demo must support:

1. Admin creates/publishes a product and adds stock; customer can discover and buy it.
2. Customer order appears in admin; staff pick, pack and dispatch it; customer sees shipment status.
3. Two checkout attempts compete for the final unit; only one obtains the hold.
4. Reservation expires; stock and coin holds are released.
5. Payment is pending/declined, or succeeds with a delayed confirmation.
6. Replayed payment or dispatch events cause no duplicate effects.
7. Partial shipment and partial refund preserve correct remaining quantities and amounts.
8. Damaged return does not increase saleable stock.
9. Catalogue/address edits do not alter a historical order.
10. Unauthorised staff/customer actions receive a denied response.

Expose scenario/reset tools through a demo-only panel or developer command. Mock concurrency proves the adapter's behaviour; production inventory guarantees still require database-level tests.

## 10. Production security, privacy and reliability

- Verify Firebase tokens and enforce API permissions/resource ownership on every protected operation.
- Restrict private documents to authorised customers/staff; use expiring access where appropriate.
- Keep payment secrets and provider webhook verification server-side. Store payment references, never card numbers/CVV.
- Audit sensitive staff actions and avoid recording tokens, payment secrets or unnecessary customer data in logs.
- Validate file types/sizes and secure uploads; avoid trusting client filenames or content-type declarations alone.
- Separate development, staging and production configuration and data. Demo adapters must fail closed if selected in a production deployment.
- Provide backup/restore procedures, monitoring, alerting and retry/dead-letter handling for asynchronous work.
- Dispatch notifications after successful commits; prevent retries from sending duplicate events.
- Analytics must be optional for shopping and must exclude customer names, contact/address details, auth IDs, internal customer IDs, payment data and staff notes. Sanitise URLs, query values and event parameters; avoid sending raw free-text searches by default.
- Implement consent preferences, editable privacy disclosures and a customer data/deletion request workflow. Retained financial records and account removal need an approved retention policy.
- Do not claim that this technical specification establishes legal compliance; use retailer-approved policies and verified provider requirements for production.

## 11. Implementation milestones

### M1 — Foundation and first vertical workflow

Scaffold both apps, shared contracts, design tokens and one mock data store. Build customer home/category/listing/detail and admin products/categories/inventory. Complete admin publication → stock adjustment → storefront availability.

### M2 — Shopping and orders

Build cart, checkout, demo authentication/payment, reservation handling, customer orders, admin orders and manual order creation. Complete customer purchase → admin order visibility and staff invoice-before-payment workflow.

### M3 — Operations and account

Build picking/packing/shipping, documents, customer profile/addresses, loyalty, returns/refunds, promotions and reports. Implement role-based UI and service permissions, exception states and demo scenarios.

### M4 — Prototype review and handoff

Verify responsive layouts, keyboard access, cross-app consistency, business invariants and clean startup. Deliver review screenshots, demo instructions, known limitations and unresolved decisions. Mark which modules are simulated.

### M5 — Production integrations

After requirements are confirmed, implement backend schema/migrations, authentication, payment webhooks, jobs, storage, notifications, deployment and monitoring. Run database concurrency, authorisation, payment recovery and operational tests before release.

## 12. Acceptance criteria

### Prototype completion

- Both applications start using documented commands from a clean checkout, with seeded mock data and no cloud credentials.
- Customer journeys work at 360/390/430px and desktop; admin works at 1280/1440px. No unintended page overflow or overlapping sticky controls.
- Search, filters, quick-add, variants, cart quantities and checkout work with shared state and clear errors.
- Admin product/stock changes become visible in the customer app; customer orders become visible in admin without manually editing fixtures.
- Staff can demonstrate invoice-before-payment, picking, packing, partial dispatch, return disposition and partial refund.
- Payment/fulfilment/document states remain separate; simulated actions are clearly labelled.
- Stock and loyalty invariants pass meaningful tests for duplicate events, expiry, concurrency and cancellation.
- Customer ownership and proposed staff permission restrictions are verified at the service boundary.
- Loading, empty, validation, error and permission-denied states are implemented.
- Type checking, linting, build and relevant automated tests pass; verification results and limitations are recorded.

### Production readiness additions

- Real authentication, backend authorisation, transactional inventory and payment-provider verification replace mock controls.
- Duplicate and out-of-order provider events, late payment after expiry and retry recovery are tested.
- Real documents/notifications, storage access, backups, monitoring and deployment rollback are verified.
- Business defaults, policies, pricing/tax configuration, carrier choices and operational permissions are approved and recorded.

## 13. Required handoff from the implementing AI

Deliver source code, lockfile, seed/reset tools, environment example without secrets, setup commands, architecture rationale, typed API contract, assumptions register and verification record. Include screenshots of mobile home/listing/detail/cart/checkout and desktop admin products/inventory/order/fulfilment screens.

List incomplete integrations plainly. State exactly what is functional, what is simulated and what must be decided before production. Avoid declaring completion based only on screenshots or a successful build.

## 14. Copyable implementation prompt

```text
Implement the attached PHASE_1_DEVELOPMENT_BRIEF.md in the ausFoodStore repository.

Start with the interactive prototype described in section 2.1. Build both the
mobile-first customer storefront and desktop admin portal using React and
TypeScript, shared commerce contracts and one authoritative mock data store.

Read repository instructions first. Record the frontend build/rendering choice
and draft assumptions, then implement the milestones in order. Follow the
latest web/admin-first scope; native apps are deferred.

Use the document's configurable defaults for unresolved business details.
Keep mock authentication, payments, notifications and documents clearly labelled.
Use service adapters so real Firebase/AWS integrations can replace mocks later.

Deliver connected workflows, not only static screens: admin publishes a product
and adjusts stock; customer adds it to cart and checks out; admin fulfils the
order; customer sees its status. Implement inventory, payment, loyalty and
permission rules at the service boundary as specified.

Complete the prototype acceptance criteria, run appropriate checks and browser
verification, and provide the documented handoff. Record production integration
work separately. Do not deploy or connect live payment services as part of the
prototype deliverable.
```

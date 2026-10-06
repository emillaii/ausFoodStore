import type { Express } from 'express';
import type { Address, CheckoutAttempt, CheckoutLineSnapshot, Customer } from '@aus/contracts';
import { db, nextId, nextOrderNumber, persist } from './db';
import { fail, getAuth, int, ok, ownerKeyOf, str, uuid, nowIso } from './http';
import { addLoyalty, availableOf, computeAttemptTotals, effectiveUnitPrice, findSku, moveInventory, orderLineFromSnapshot } from './domain';
import { buildCartView } from './catalog';
import { mergeCarts } from './auth';

const RESERVATION_MS = 15 * 60 * 1000;

/** Release stock and coin holds for an attempt that will never be paid. Idempotent. */
function releaseAttempt(attempt: CheckoutAttempt, reason: string, newStatus: CheckoutAttempt['status']): void {
  if (attempt.status === 'PAID') return;
  const wasActive = attempt.status === 'RESERVED' || attempt.status === 'PAYMENT_PENDING';
  attempt.status = newStatus;
  if (wasActive) {
    for (const line of attempt.lines) {
      if (attempt.reservationCommitted) {
        moveInventory(line.skuId, { reserved: -line.quantity }, 'RESERVATION_RELEASE', attempt.id, reason, 'system');
      }
    }
    if (attempt.coinRedeemed > 0 && attempt.customerId) {
      addLoyalty(attempt.customerId, 'REDEEM_RELEASE', 0, attempt.coinRedeemed, attempt.id, reason);
    }
  }
  attempt.reservationCommitted = false;
  attempt.reservationExpiresAt = undefined;
  persist();
}

/** Expire overdue reservations; called lazily on every relevant read/write and on an interval. */
export function sweepExpiredAttempts(): void {
  const now = Date.now();
  for (const attempt of db.checkoutAttempts) {
    if (
      (attempt.status === 'RESERVED' || attempt.status === 'PAYMENT_PENDING') &&
      attempt.reservationExpiresAt && new Date(attempt.reservationExpiresAt).getTime() < now
    ) {
      releaseAttempt(attempt, 'Reservation expired — stock and coin holds released', 'EXPIRED');
    }
  }
}

function createOrderFromAttempt(attempt: CheckoutAttempt, customer?: Customer | null): void {
  const number = nextOrderNumber();
  const totals = computeAttemptTotals(attempt.lines, {
    coinRedeemed: attempt.coinRedeemed,
    address: attempt.shippingAddress,
    customer,
  });
  const order = {
    id: nextId('ord'), number,
    ownerKey: attempt.customerId ?? attempt.ownerKey,
    customerId: attempt.customerId,
    guestAccessCode: attempt.customerId ? undefined : uuid().slice(0, 8).toUpperCase(),
    contact: attempt.contact,
    lines: attempt.lines.map(orderLineFromSnapshot),
    shippingAddress: attempt.shippingAddress,
    billingAddress: attempt.billingAddress,
    paymentStatus: 'PAID' as const,
    fulfilmentStatus: 'READY_TO_PICK' as const,
    subtotalCents: totals.subtotalCents,
    coinDiscountCents: totals.coinDiscountCents,
    manualDiscountCents: 0,
    shippingCents: totals.shippingCents,
    totalCents: totals.totalCents,
    gstIncludedCents: totals.gstIncludedCents,
    coinsEarnedPending: totals.coinsEarned,
    coinsEarnedAvailable: 0,
    coinsRedeemed: attempt.coinRedeemed,
    payments: [{
      id: nextId('pay'), attemptId: attempt.id, providerRef: `demo_pi_${number.replace('ORD-', '')}`,
      method: 'CARD_DEMO' as const, amountCents: totals.totalCents, status: 'SUCCEEDED' as const,
      refundedCents: 0, createdAt: nowIso(),
    }],
    refunds: [], shipments: [], documents: [], returns: [], internalNotes: [],
    exception: null, placedAt: nowIso(), updatedAt: nowIso(),
  };
  db.orders.unshift(order);
  attempt.orderId = order.id;
  attempt.status = 'PAID';
  // The purchased lines are consumed — cart resets for the next shop.
  delete db.carts[attempt.ownerKey];

  // Loyalty: commit the redemption hold, then create pending earnings.
  if (attempt.coinRedeemed > 0 && attempt.customerId) {
    addLoyalty(attempt.customerId, 'REDEEM_COMMIT', 0, 0, order.number, 'Payment captured — redeemed coins committed');
  }
  if (attempt.customerId && totals.coinsEarned > 0) {
    addLoyalty(attempt.customerId, 'EARN_PENDING', totals.coinsEarned, 0, order.number,
      `Sample rule: ${db.settings.coinsPerDollar} coin(s) per AUD 1 — pending until full shipment`);
  }
  persist();
}

function addressFromBody(b: Record<string, unknown>, customerId?: string): Address {
  const list = customerId ? (db.addresses[customerId] ?? []) : [];
  if (typeof b.addressId === 'string' && b.addressId) {
    const found = list.find((a) => a.id === b.addressId);
    if (!found) fail(404, 'NOT_FOUND', 'Selected address not found.');
    return { ...found };
  }
  const postcode = str(b.postcode, 'Postcode')!;
  if (!/^\d{4}$/.test(postcode)) fail(422, 'VALIDATION', 'Enter a valid 4-digit Australian postcode.');
  return {
    id: nextId('addr'),
    name: str(b.name, 'Name')!, phone: str(b.phone, 'Phone')!,
    line1: str(b.line1, 'Address line 1')!, line2: str(b.line2, 'Address line 2', { optional: true }),
    suburb: str(b.suburb, 'Suburb')!, state: str(b.state, 'State')!, postcode, country: 'AU',
    isDefaultShipping: false, isDefaultBilling: false,
  };
}

export function registerCheckoutRoutes(app: Express): void {
  // Quote: authoritative preview of totals + conflict detection, without holding stock.
  app.post('/checkout/quote', (req, res) => {
    sweepExpiredAttempts();
    const auth = getAuth(req);
    const ownerKey = ownerKeyOf(auth);
    const cart = db.carts[ownerKey];
    const lines = (cart?.lines ?? [])
      .map((l) => {
        const sku = findSku(l.skuId);
        if (!sku || !sku.active) return null;
        return { sku, quantity: l.quantity };
      })
      .filter((x): x is { sku: NonNullable<ReturnType<typeof findSku>>; quantity: number } => x !== null);
    if (lines.length === 0) fail(422, 'VALIDATION', 'Your cart is empty.');

    const snapshots: CheckoutLineSnapshot[] = lines.map(({ sku, quantity }) => {
      const product = db.products.find((p) => p.id === sku.productId)!;
      const unit = effectiveUnitPrice(sku, auth.customer);
      return {
        skuId: sku.id, productId: product.id, productName: product.name, skuCode: sku.code,
        optionSummary: Object.entries(sku.optionValues).map(([k, v]) => `${k}: ${v}`).join(', ') || (sku.packSize ?? ''),
        packSize: sku.packSize, imageGlyph: product.imageGlyph, imageHue: product.imageHue,
        unitPriceCents: unit, quantity, taxClass: sku.taxClass, lineTotalCents: unit * quantity,
        availableAtQuote: availableOf(sku.id),
      };
    });

    // Quote only needs the postcode for shipping/free-threshold/unserviceable-area math.
    const rawPostcode = typeof req.body?.address?.postcode === 'string' ? req.body.address.postcode : undefined;
    const address = rawPostcode ? { postcode: rawPostcode } : null;
    const coinRedeemed = int(req.body?.coinRedeemed, 'Coins', { min: 0, optional: true }) ?? 0;
    const totals = computeAttemptTotals(snapshots, { coinRedeemed, address, customer: auth.customer });
    const stockIssues = snapshots
      .filter((s) => s.availableAtQuote < s.quantity)
      .map((s) => ({ skuId: s.skuId, productName: s.productName, available: s.availableAtQuote, requested: s.quantity }));

    ok(res, {
      lines: snapshots, totals, stockIssues,
      deliverySupported: totals.deliverySupported,
      coinsBalance: auth.customer ? { ...loyaltyOf(auth.customer.id) } : null,
      maxRedeemableCoins: auth.customer
        ? Math.floor(loyaltyOf(auth.customer.id).available / db.settings.coinRedemptionStep) * db.settings.coinRedemptionStep
        : 0,
    });
  });

  // Begin payment: creates the attempt, holds stock (15 min) and coin redemption. Idempotent.
  app.post('/checkout/attempts', (req, res) => {
    sweepExpiredAttempts();
    const auth = getAuth(req);
    const ownerKey = ownerKeyOf(auth);
    const b = req.body ?? {};

    const idempotencyKey = str(b.idempotencyKey, 'Idempotency key', { optional: true, max: 80 });
    if (idempotencyKey) {
      const existing = db.checkoutAttempts.find(
        (a) => a.idempotencyKey === idempotencyKey && (a.status === 'RESERVED' || a.status === 'PAYMENT_PENDING' || a.status === 'PAID'),
      );
      if (existing) return ok(res, { attempt: existing, reused: true });
    }

    const cart = db.carts[ownerKey];
    const lines: CheckoutLineSnapshot[] = (cart?.lines ?? []).flatMap((l) => {
      const sku = findSku(l.skuId);
      if (!sku || !sku.active) return [];
      const product = db.products.find((p) => p.id === sku.productId)!;
      const unit = effectiveUnitPrice(sku, auth.customer);
      return [{
        skuId: sku.id, productId: product.id, productName: product.name, skuCode: sku.code,
        optionSummary: Object.entries(sku.optionValues).map(([k, v]) => `${k}: ${v}`).join(', ') || (sku.packSize ?? ''),
        packSize: sku.packSize, imageGlyph: product.imageGlyph, imageHue: product.imageHue,
        unitPriceCents: unit, quantity: l.quantity, taxClass: sku.taxClass,
        lineTotalCents: unit * l.quantity, availableAtQuote: availableOf(sku.id),
      }];
    });
    if (lines.length === 0) fail(422, 'VALIDATION', 'Your cart is empty.');

    const shippingAddress = addressFromBody(b.shippingAddress ?? {}, auth.customer?.id);
    const billingAddress = b.billingAddress ? addressFromBody(b.billingAddress, auth.customer?.id) : undefined;
    if (!db.settings.excludedPostcodes.includes(shippingAddress.postcode)) {
      // supported — proceed
    } else {
      fail(409, 'DELIVERY_UNSUPPORTED', `We don't deliver to postcode ${shippingAddress.postcode} in this demo.`, { postcode: shippingAddress.postcode });
    }

    const customerNameDefault = auth.customer ? `${auth.customer.firstName} ${auth.customer.lastName}`.trim() : undefined;
    const contact = {
      name: str(b.contactName, 'Contact name', { optional: customerNameDefault != null }) ?? customerNameDefault!,
      email: str(b.contactEmail, 'Contact email', { optional: customerNameDefault != null })?.trim() ?? auth.customer!.email,
      phone: str(b.contactPhone, 'Contact phone', { optional: true }) ?? auth.customer?.phone ?? '',
    };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)) fail(422, 'VALIDATION', 'Enter a valid contact email.');

    const coinRedeemed = int(b.coinRedeemed, 'Coins', { min: 0, optional: true }) ?? 0;
    if (coinRedeemed > 0) {
      if (!auth.customer) fail(422, 'VALIDATION', 'Loyalty redemption requires an account.');
      if (coinRedeemed % db.settings.coinRedemptionStep !== 0) {
        fail(422, 'VALIDATION', `Coins must be redeemed in steps of ${db.settings.coinRedemptionStep}.`);
      }
      const balance = loyaltyOf(auth.customer.id);
      if (coinRedeemed > balance.available) fail(422, 'VALIDATION', `You have ${balance.available} coins available.`);
    }

    // Atomic stock hold: all lines must be available, otherwise nothing is held.
    const insufficient = lines.filter((l) => availableOf(l.skuId) < l.quantity);
    if (insufficient.length > 0) {
      fail(409, 'STOCK_UNAVAILABLE', 'Some items are no longer available in the requested quantity.',
        { lines: insufficient.map((l) => ({ skuId: l.skuId, productName: l.productName, available: availableOf(l.skuId), requested: l.quantity })) });
    }

    const attempt: CheckoutAttempt = {
      id: nextId('att'), ownerKey, customerId: auth.customer?.id,
      contact, shippingAddress, billingAddress, lines,
      subtotalCents: 0, memberDiscountCents: 0, coinRedeemed, coinDiscountCents: 0,
      shippingCents: 0, taxCents: { gstIncludedCents: 0, gstFreeCents: 0 }, totalCents: 0,
      status: 'RESERVED', reservationExpiresAt: new Date(Date.now() + RESERVATION_MS).toISOString(),
      reservationCommitted: false, idempotencyKey, createdAt: nowIso(),
    };
    const totals = computeAttemptTotals(lines, { coinRedeemed, address: shippingAddress, customer: auth.customer });
    attempt.subtotalCents = totals.subtotalCents;
    attempt.coinDiscountCents = totals.coinDiscountCents;
    attempt.shippingCents = totals.shippingCents;
    attempt.totalCents = totals.totalCents;
    attempt.taxCents = { gstIncludedCents: totals.gstIncludedCents, gstFreeCents: totals.subtotalCents - totals.gstIncludedCents };

    for (const line of lines) {
      moveInventory(line.skuId, { reserved: line.quantity }, 'RESERVATION_HOLD', attempt.id, 'Payment authorisation hold', 'system');
    }
    attempt.reservationCommitted = true;
    if (coinRedeemed > 0 && auth.customer) {
      addLoyalty(auth.customer.id, 'REDEEM_HOLD', 0, -coinRedeemed, attempt.id, 'Coins held at checkout');
    }
    db.checkoutAttempts.unshift(attempt);
    persist();
    ok(res, { attempt, reused: false });
  });

  app.get('/checkout/attempts/:id', (req, res) => {
    sweepExpiredAttempts();
    const attempt = db.checkoutAttempts.find((a) => a.id === req.params.id);
    if (!attempt) fail(404, 'NOT_FOUND', 'Checkout attempt not found.');
    const auth = getAuth(req);
    if (attempt.customerId && attempt.customerId !== auth.customer?.id) fail(403, 'FORBIDDEN', 'This checkout belongs to another customer.');
    if (!attempt.customerId && attempt.ownerKey !== ownerKeyOf(auth)) fail(403, 'FORBIDDEN', 'This checkout belongs to another session.');
    ok(res, { attempt, serverTime: nowIso() });
  });

  app.post('/checkout/attempts/:id/cancel', (req, res) => {
    const attempt = db.checkoutAttempts.find((a) => a.id === req.params.id);
    if (!attempt) fail(404, 'NOT_FOUND', 'Checkout attempt not found.');
    if (attempt.status === 'RESERVED' || attempt.status === 'PAYMENT_PENDING') {
      releaseAttempt(attempt, 'Cancelled by customer', 'CANCELLED');
    }
    ok(res, { attempt });
  });

  /**
   * Simulated payment step — the production integration replaces this with a
   * provider-hosted flow. Outcomes: SUCCESS | FAILED | PENDING.
   * Calling pay on an already-paid attempt is a no-op (idempotent).
   */
  app.post('/checkout/attempts/:id/pay', (req, res) => {
    sweepExpiredAttempts();
    const attempt = db.checkoutAttempts.find((a) => a.id === req.params.id);
    if (!attempt) fail(404, 'NOT_FOUND', 'Checkout attempt not found.');
    const outcome = str(req.body?.outcome, 'Outcome')!;

    if (attempt.status === 'PAID') {
      return ok(res, { attempt, order: db.orders.find((o) => o.id === attempt.orderId) ?? null, duplicate: true });
    }
    if (attempt.status === 'FAILED' || attempt.status === 'CANCELLED') {
      fail(409, 'CONFLICT', `This checkout was already ${attempt.status.toLowerCase()}. Start a new checkout.`);
    }

    if (outcome === 'PENDING') {
      if (attempt.status !== 'PAYMENT_PENDING') {
        attempt.status = 'PAYMENT_PENDING';
        attempt.paymentOutcome = 'PENDING';
        persist();
      }
      return ok(res, { attempt, order: null, pending: true });
    }

    if (outcome === 'FAILED') {
      releaseAttempt(attempt, 'Payment declined by simulated provider', 'FAILED');
      return ok(res, { attempt, order: null, declined: true });
    }

    if (outcome !== 'SUCCESS') fail(422, 'VALIDATION', 'Outcome must be SUCCESS, FAILED or PENDING.');

    // Price-change guard: totals are re-validated against current effective prices.
    for (const line of attempt.lines) {
      const sku = findSku(line.skuId);
      if (!sku || !sku.active) {
        fail(409, 'PRICE_CHANGED', 'An item in your checkout is no longer available.', { lines: [line.skuId] });
      }
      const current = effectiveUnitPrice(sku, attempt.customerId ? db.customers.find((c) => c.id === attempt.customerId) ?? null : null);
      if (current !== line.unitPriceCents) {
        fail(409, 'PRICE_CHANGED', 'Prices changed since your checkout started. Review the updated totals.',
          { lines: attempt.lines.map((l) => ({ skuId: l.skuId, snapshottedCents: l.unitPriceCents, currentCents: l.skuId === line.skuId ? current : effectiveUnitPrice(findSku(l.skuId)!, null) })) });
      }
    }

    const customer = attempt.customerId ? db.customers.find((c) => c.id === attempt.customerId) ?? null : null;

    if (attempt.status === 'EXPIRED') {
      // Late confirmation (§8.2): re-secure stock and coins atomically, or raise an exception.
      const canSecure = attempt.lines.every((l) => availableOf(l.skuId) >= l.quantity);
      const coinOk = !attempt.coinRedeemed || !customer || loyaltyOf(customer.id).available >= attempt.coinRedeemed;
      if (canSecure && coinOk) {
        for (const line of attempt.lines) {
          moveInventory(line.skuId, { reserved: line.quantity }, 'RESERVATION_HOLD', attempt.id, 'Late payment confirmation — reservation re-secured', 'system');
        }
        attempt.reservationCommitted = true;
        if (attempt.coinRedeemed > 0 && customer) {
          addLoyalty(customer.id, 'REDEEM_HOLD', 0, -attempt.coinRedeemed, attempt.id, 'Late payment — coin hold re-applied');
        }
        createOrderFromAttempt(attempt, customer);
        return ok(res, { attempt, order: db.orders.find((o) => o.id === attempt.orderId) ?? null, reconciled: true });
      }
      // Money taken but stock/coins gone: create an exception order and simulate the configured void/refund.
      attempt.reservationCommitted = false;
      createExceptionOrder(attempt, customer, canSecure ? 'LOYALTY' : 'STOCK');
      return ok(res, { attempt, order: db.orders.find((o) => o.id === attempt.orderId) ?? null, exception: true });
    }

    createOrderFromAttempt(attempt, customer);
    ok(res, { attempt, order: db.orders.find((o) => o.id === attempt.orderId) ?? null });
  });

  app.post('/checkout/complete-pending/:id', (req, res) => {
    // Simulates the delayed provider webhook confirming a pending payment.
    const attempt = db.checkoutAttempts.find((a) => a.id === req.params.id);
    if (!attempt) fail(404, 'NOT_FOUND', 'Checkout attempt not found.');
    if (attempt.status !== 'PAYMENT_PENDING') fail(409, 'CONFLICT', `Attempt is ${attempt.status}, not awaiting confirmation.`);
    sweepExpiredAttempts();
    // After the sweep, an expired pending attempt can no longer be confirmed safely.
    if ((attempt.status as string) === 'EXPIRED') fail(409, 'RESERVATION_EXPIRED', 'Reservation expired while payment was pending. Reconciling requires staff review in this demo.');
    const customer = attempt.customerId ? db.customers.find((c) => c.id === attempt.customerId) ?? null : null;
    createOrderFromAttempt(attempt, customer);
    ok(res, { attempt, order: db.orders.find((o) => o.id === attempt.orderId) ?? null });
  });
}

function createExceptionOrder(attempt: CheckoutAttempt, customer: Customer | null, cause: 'STOCK' | 'LOYALTY'): void {
  const number = nextOrderNumber();
  const order = {
    id: nextId('ord'), number,
    ownerKey: attempt.customerId ?? attempt.ownerKey,
    customerId: attempt.customerId,
    guestAccessCode: attempt.customerId ? undefined : uuid().slice(0, 8).toUpperCase(),
    contact: attempt.contact,
    lines: attempt.lines.map(orderLineFromSnapshot),
    shippingAddress: attempt.shippingAddress, billingAddress: attempt.billingAddress,
    paymentStatus: 'REFUNDED' as const,
    fulfilmentStatus: 'CANCELLED' as const,
    subtotalCents: attempt.subtotalCents,
    coinDiscountCents: 0,
    manualDiscountCents: 0,
    shippingCents: attempt.shippingCents,
    totalCents: attempt.totalCents,
    gstIncludedCents: attempt.taxCents.gstIncludedCents,
    coinsEarnedPending: 0, coinsEarnedAvailable: 0, coinsRedeemed: 0,
    payments: [{
      id: nextId('pay'), attemptId: attempt.id, providerRef: `demo_pi_${number.replace('ORD-', '')}`,
      method: 'CARD_DEMO' as const, amountCents: attempt.totalCents, status: 'REFUNDED' as const,
      refundedCents: attempt.totalCents, createdAt: nowIso(),
    }],
    refunds: [{
      id: nextId('ref'), orderId: '', paymentId: '', amountCents: attempt.totalCents,
      status: 'SUCCEEDED' as const, reason: `Automatic void/refund — ${cause === 'STOCK' ? 'stock could not be re-secured after reservation expiry' : 'loyalty hold could not be re-applied'}`,
      requestedBy: 'system', createdAt: nowIso(), resolvedAt: nowIso(),
    }],
    shipments: [], documents: [], returns: [], internalNotes: [],
    exception: 'PAYMENT_AFTER_EXPIRY' as const, placedAt: nowIso(), updatedAt: nowIso(),
  };
  order.refunds[0].orderId = order.id;
  order.refunds[0].paymentId = order.payments[0].id;
  db.orders.unshift(order);
  attempt.orderId = order.id;
  attempt.status = 'PAID';
  delete db.carts[attempt.ownerKey];
  persist();
}

function loyaltyOf(customerId: string) {
  let available = 0, pending = 0;
  for (const e of db.loyalty) {
    if (e.customerId !== customerId) continue;
    available += e.deltaAvailable;
    pending += e.deltaPending;
  }
  const held = db.checkoutAttempts
    .filter((a) => a.customerId === customerId && (a.status === 'RESERVED' || a.status === 'PAYMENT_PENDING'))
    .reduce((sum, a) => sum + a.coinRedeemed, 0);
  return { available, pending, held };
}

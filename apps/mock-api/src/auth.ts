import type { Express, Request } from 'express';
import type { Address, Customer } from '@aus/contracts';
import { db, nextId, persist } from './db';
import { fail, getAuth, int, ok, ownerKeyOf, requireCustomer, str, uuid, nowIso } from './http';

function validAddressBody(b: Record<string, unknown>): Omit<Address, 'id' | 'isDefaultShipping' | 'isDefaultBilling'> {
  const postcode = str(b.postcode, 'Postcode')!;
  if (!/^\d{4}$/.test(postcode)) fail(422, 'VALIDATION', 'Postcode must be a 4-digit Australian postcode.');
  const state = str(b.state, 'State')!;
  if (!['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'].includes(state)) fail(422, 'VALIDATION', 'State must be an Australian state/territory code.');
  return {
    name: str(b.name, 'Name')!, phone: str(b.phone, 'Phone')!,
    line1: str(b.line1, 'Address line 1')!, line2: str(b.line2, 'Address line 2', { optional: true, max: 120 }),
    suburb: str(b.suburb, 'Suburb')!, state, postcode, country: 'AU',
  };
}

export function registerAuthRoutes(app: Express): void {
  app.post('/auth/register', (req, res) => {
    const b = req.body ?? {};
    const email = str(b.email, 'Email')!.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(422, 'VALIDATION', 'Enter a valid email address.');
    if (db.customers.some((c) => c.email === email)) fail(409, 'CONFLICT', 'An account with this email already exists. Try signing in.');
    const password = str(b.password, 'Password')!;
    if (password.length < 8) fail(422, 'VALIDATION', 'Password must be at least 8 characters.');
    const customer: Customer = {
      id: nextId('cust'), email, password, // DEMO ONLY — production uses Firebase Auth.
      firstName: str(b.firstName, 'First name')!, lastName: str(b.lastName, 'Last name')!,
      phone: str(b.phone, 'Phone', { optional: true, max: 20 }),
      member: true, state: 'ACTIVE',
      consentHistory: [{ marketing: b.marketing === true, analytics: b.analytics === true, changedAt: nowIso() }],
      notes: [], createdAt: nowIso(),
    };
    db.customers.push(customer);
    const token = uuid();
    db.sessions.push({ token, customerId: customer.id, createdAt: nowIso() });

    // Merge any guest cart into the new account cart.
    const guestKey = req.header('x-session-key');
    if (guestKey) mergeCarts(`guest:${guestKey}`, customer.id);
    persist();
    ok(res, { customer: publicCustomer(customer), token });
  });

  app.post('/auth/login', (req, res) => {
    const b = req.body ?? {};
    const email = str(b.email, 'Email')!.trim().toLowerCase();
    const password = str(b.password, 'Password')!;
    const customer = db.customers.find((c) => c.email === email);
    if (!customer || customer.password !== password) fail(401, 'UNAUTHENTICATED', 'Email or password is incorrect.');
    if (customer.state === 'SUSPENDED') fail(403, 'FORBIDDEN', 'This account is suspended. Contact support.');
    const token = uuid();
    db.sessions.push({ token, customerId: customer.id, createdAt: nowIso() });
    const guestKey = req.header('x-session-key');
    if (guestKey) mergeCarts(`guest:${guestKey}`, customer.id);
    persist();
    ok(res, { customer: publicCustomer(customer), token });
  });

  app.post('/auth/logout', (req, res) => {
    const header = req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      db.sessions = db.sessions.filter((s) => s.token !== header.slice(7));
      persist();
    }
    ok(res, { ok: true });
  });

  app.get('/auth/me', (req, res) => {
    const auth = getAuth(req);
    const customer = requireCustomer(auth);
    ok(res, publicCustomer(customer));
  });

  app.put('/customers/me', (req, res) => {
    const customer = requireCustomer(getAuth(req));
    const b = req.body ?? {};
    if (b.firstName != null) customer.firstName = str(b.firstName, 'First name')!;
    if (b.lastName != null) customer.lastName = str(b.lastName, 'Last name')!;
    if (b.phone !== undefined) customer.phone = str(b.phone, 'Phone', { optional: true, max: 20 });
    if (b.consent && typeof b.consent === 'object') {
      customer.consentHistory.unshift({
        marketing: b.consent.marketing === true, analytics: b.consent.analytics === true, changedAt: nowIso(),
      });
    }
    persist();
    ok(res, publicCustomer(customer));
  });

  app.post('/customers/me/deletion-request', (req, res) => {
    const customer = requireCustomer(getAuth(req));
    customer.state = 'DELETION_REQUESTED';
    persist();
    ok(res, { ok: true, message: 'Deletion request recorded. Staff will review it (demo workflow).' });
  });

  app.get('/customers/me/addresses', (req, res) => {
    const customer = requireCustomer(getAuth(req));
    ok(res, db.addresses[customer.id] ?? []);
  });

  app.post('/customers/me/addresses', (req, res) => {
    const customer = requireCustomer(getAuth(req));
    const body = validAddressBody(req.body ?? {});
    const list = (db.addresses[customer.id] ??= []);
    const address: Address = {
      ...body, id: nextId('addr'),
      isDefaultShipping: req.body.isDefaultShipping === true || list.length === 0,
      isDefaultBilling: req.body.isDefaultBilling === true || list.length === 0,
    };
    if (address.isDefaultShipping) list.forEach((a) => (a.isDefaultShipping = false));
    if (address.isDefaultBilling) list.forEach((a) => (a.isDefaultBilling = false));
    list.push(address);
    persist();
    ok(res, address);
  });

  app.put('/customers/me/addresses/:id', (req, res) => {
    const customer = requireCustomer(getAuth(req));
    const list = db.addresses[customer.id] ?? [];
    const address = list.find((a) => a.id === req.params.id);
    if (!address) fail(404, 'NOT_FOUND', 'Address not found.');
    const body = validAddressBody(req.body ?? {});
    Object.assign(address, body);
    if (req.body.isDefaultShipping === true) {
      list.forEach((a) => (a.isDefaultShipping = a.id === address.id));
      address.isDefaultShipping = true;
    }
    if (req.body.isDefaultBilling === true) {
      list.forEach((a) => (a.isDefaultBilling = a.id === address.id));
      address.isDefaultBilling = true;
    }
    persist();
    ok(res, address);
  });

  app.delete('/customers/me/addresses/:id', (req, res) => {
    const customer = requireCustomer(getAuth(req));
    const list = (db.addresses[customer.id] ??= []);
    const before = list.length;
    db.addresses[customer.id] = list.filter((a) => a.id !== req.params.id);
    if (db.addresses[customer.id].length === before) fail(404, 'NOT_FOUND', 'Address not found.');
    const remaining = db.addresses[customer.id];
    if (remaining.length && !remaining.some((a) => a.isDefaultShipping)) remaining[0].isDefaultShipping = true;
    if (remaining.length && !remaining.some((a) => a.isDefaultBilling)) remaining[0].isDefaultBilling = true;
    persist();
    ok(res, { ok: true });
  });

  // Public policy content (editable in admin settings).
  app.get('/settings/policies/:slug', (req, res) => {
    const page = db.settings.policyPages.find((p) => p.slug === req.params.slug);
    if (!page) fail(404, 'NOT_FOUND', 'Policy page not found.');
    ok(res, page);
  });

  // Loyalty (customer view)
  app.get('/loyalty', (req, res) => {
    const customer = requireCustomer(getAuth(req));
    ok(res, {
      balance: loyaltyBalanceSafe(customer.id),
      transactions: db.loyalty.filter((e) => e.customerId === customer.id),
      rules: {
        coinsPerDollar: db.settings.coinsPerDollar,
        coinsPerDollarValue: db.settings.coinsPerDollarValue,
        redemptionStep: db.settings.coinRedemptionStep,
        note: 'Sample rules — not customer-approved terms.',
      },
    });
  });

  // Guest order access — requires order number + email + access code (scoped, never ID alone).
  app.post('/orders/guest-lookup', (req, res) => {
    const b = req.body ?? {};
    const number = str(b.orderNumber, 'Order number')!.trim().toUpperCase();
    const email = str(b.email, 'Email')!.trim().toLowerCase();
    const code = str(b.accessCode, 'Access code')!;
    const order = db.orders.find((o) => o.number === number);
    if (!order || order.customerId) fail(404, 'NOT_FOUND', 'No matching guest order.');
    if (order.contact.email.toLowerCase() !== email || order.guestAccessCode !== code) {
      fail(403, 'FORBIDDEN', 'Order details do not match.');
    }
    ok(res, order);
  });
}

function loyaltyBalanceSafe(customerId: string) {
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

export function publicCustomer(c: Customer) {
  const { password, ...safe } = c;
  void password;
  return { ...safe, addressCount: (db.addresses[c.id] ?? []).length };
}

export function mergeCarts(fromOwnerKey: string, intoCustomerId: string): string[] {
  const from = db.carts[fromOwnerKey];
  const into = (db.carts[intoCustomerId] ??= { ownerKey: intoCustomerId, lines: [], version: 0, updatedAt: nowIso() });
  const notes: string[] = [];
  if (!from || from.lines.length === 0) return notes;
  for (const line of from.lines) {
    const existing = into.lines.find((l) => l.skuId === line.skuId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + line.quantity, 99);
      notes.push(`Combined quantities for an item you had in both carts (now ${existing.quantity}).`);
    } else {
      into.lines.push({ ...line });
    }
  }
  into.version += 1;
  into.updatedAt = nowIso();
  delete db.carts[fromOwnerKey];
  persist();
  return notes;
}

export { int };

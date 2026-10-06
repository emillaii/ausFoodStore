import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { CartLineAvailable, CartLineView, CartView } from '../lib/types';
import { Badge, Button, ErrorState, Field, Loading, Modal, Price, ProductImage } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { CheckoutAttempt } from '@aus/contracts';

interface AddressForm {
  name: string; phone: string; line1: string; line2: string; suburb: string; state: string; postcode: string;
}
const EMPTY_ADDRESS: AddressForm = { name: '', phone: '', line1: '', line2: '', suburb: '', state: 'NSW', postcode: '' };

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
const STEP_LABELS = ['Contact', 'Address', 'Loyalty', 'Review'];

export default function Checkout() {
  const { customer } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const cartQuery = useQuery<CartView>({ queryKey: ['cart'], queryFn: () => api.cart() });
  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.addresses(),
    enabled: !!customer,
  });

  const [step, setStep] = useState(0);
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<AddressForm>(EMPTY_ADDRESS);
  const [coins, setCoins] = useState(0);
  const [placedAttempt, setPlacedAttempt] = useState<CheckoutAttempt | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  const idempotencyKey = useMemo(() => `co-${crypto.randomUUID()}`, []);

  useEffect(() => {
    if (customer && !contact.email) {
      setContact({ name: `${customer.firstName} ${customer.lastName}`.trim(), email: customer.email, phone: customer.phone ?? '' });
    }
    if (customer && address.name === '') {
      const def = (addressesQuery.data ?? []).find((a) => a.isDefaultShipping);
      if (def) setAddress({ name: def.name, phone: def.phone, line1: def.line1, line2: def.line2 ?? '', suburb: def.suburb, state: def.state, postcode: def.postcode });
    }
  }, [customer, addressesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const quote = useMutation({
    mutationFn: () => api.quoteCheckout({
      address: address.postcode ? { postcode: address.postcode } : undefined,
      coinRedeemed: customer ? coins : 0,
    }),
    onSuccess: () => setTopError(null),
    onError: (e) => setTopError((e as ApiClientError).message),
  });

  // Re-quote whenever pricing inputs change.
  useEffect(() => {
    setTopError(null);
    quote.mutate();
  }, [address.postcode, coins, customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = useMutation({
    mutationFn: () => api.beginCheckout({
      idempotencyKey,
      contactName: contact.name,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      shippingAddress: address,
      billingAddress: billingSame ? undefined : billing,
      coinRedeemed: customer ? coins : 0,
    }),
    onSuccess: (data) => {
      setPlacedAttempt(data.attempt);
      setPayOpen(true);
      qc.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (e) => {
      const err = e as ApiClientError;
      setTopError(err.message);
      if (err.code === 'STOCK_UNAVAILABLE' || err.code === 'PRICE_CHANGED') {
        qc.invalidateQueries({ queryKey: ['cart'] });
        quote.mutate();
      }
    },
  });

  const pay = useMutation({
    mutationFn: (outcome: 'SUCCESS' | 'FAILED' | 'PENDING') => api.payCheckout(placedAttempt!.id, outcome),
    onSuccess: (data) => {
      setPayOpen(false);
      qc.invalidateQueries();
      navigate(`/checkout/result/${placedAttempt!.id}`);
    },
    onError: (e) => {
      setPayOpen(false);
      const err = e as ApiClientError;
      if (err.code === 'PRICE_CHANGED') {
        setTopError('Prices changed while you were checking out. Review the updated totals and start payment again.');
        setPlacedAttempt(null);
        quote.mutate();
        return;
      }
      navigate(`/checkout/result/${placedAttempt!.id}`);
    },
  });

  if (cartQuery.isLoading || (customer && addressesQuery.isLoading)) return <Loading label="Preparing checkout…" />;
  if (cartQuery.error) return <ErrorState error={cartQuery.error} onRetry={() => cartQuery.refetch()} />;

  const cart = cartQuery.data!;
  const isAvailableLine = (l: CartLineView): l is CartLineAvailable => !l.unavailable;
  const availableLines = cart.lines.filter(isAvailableLine);
  if (availableLines.length === 0) {
    return (
      <div className="state">
        <div className="icon" aria-hidden="true">🛒</div>
        <h3>Your cart is empty</h3>
        <Link className="btn btn-primary" to="/">Back to shopping</Link>
      </div>
    );
  }
  const outOfStockLines = cart.lines.filter(isAvailableLine).filter((l) => l.inStock === false);

  const quoteData = quote.data as {
    lines: { skuId: string; productName: string; unitPriceCents: number; quantity: number }[];
    totals: { subtotalCents: number; coinDiscountCents: number; shippingCents: number; totalCents: number; gstIncludedCents: number; coinsEarned: number };
    stockIssues: { skuId: string; productName: string; available: number; requested: number }[];
    deliverySupported: boolean;
    maxRedeemableCoins: number;
  } | undefined;

  const totals = quoteData?.totals;
  const addressValid = address.name && address.phone && address.line1 && address.suburb && address.state && /^\d{4}$/.test(address.postcode);
  const contactValid = contact.name && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email);
  const canPay = !!quoteData && (quoteData.stockIssues?.length ?? 0) === 0 && quoteData.deliverySupported && contactValid && addressValid && !begin.isPending;

  return (
    <div>
      <h1>Checkout</h1>
      <div className="steps" aria-hidden="true">
        {STEP_LABELS.map((_, i) => <span key={i} className={`step ${i <= step ? 'on' : ''}`} />)}
      </div>
      <p className="small muted" aria-live="polite">Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}</p>

      {topError && <div className="card card-pad mt-2" style={{ borderColor: 'var(--danger-600)' }} role="alert"><strong>Checkout issue: </strong>{topError}</div>}

      <div className="checkout-grid mt-4">
        <div>
          {/* ---------------- step 0: contact ---------------- */}
          {step === 0 && (
            <div className="card card-pad">
              <h2>Contact</h2>
              {!customer && (
                <p className="small muted">
                  Checking out as a guest. <Link to="/login?next=/checkout">Sign in</Link> to earn coins and see saved addresses.
                </p>
              )}
              <Field label="Full name" htmlFor="co-name">
                <input id="co-name" className="input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoComplete="name" required />
              </Field>
              <Field label="Email" htmlFor="co-email" hint="Order updates are simulated in this demo.">
                <input id="co-email" className="input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="email" required />
              </Field>
              <Field label="Phone (optional)" htmlFor="co-phone">
                <input id="co-phone" className="input" type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} autoComplete="tel" />
              </Field>
              <Button block disabled={!contactValid} onClick={() => setStep(1)}>Continue to address</Button>
            </div>
          )}

          {/* ---------------- step 1: address ---------------- */}
          {step === 1 && (
            <div className="card card-pad">
              <h2>Delivery address</h2>
              {customer && (addressesQuery.data ?? []).length > 0 && (
                <Field label="Saved addresses">
                  <select
                    className="select"
                    onChange={(e) => {
                      const a = (addressesQuery.data ?? []).find((x) => x.id === e.target.value);
                      if (a) setAddress({ name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 ?? '', suburb: a.suburb, state: a.state, postcode: a.postcode });
                    }}
                    defaultValue=""
                  >
                    <option value="">Choose a saved address…</option>
                    {(addressesQuery.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>{a.line1}, {a.suburb} {a.state} {a.postcode}{a.isDefaultShipping ? ' (default)' : ''}</option>
                    ))}
                  </select>
                </Field>
              )}
              <AddressFields value={address} onChange={setAddress} />
              <label className="row small" style={{ minHeight: 44 }}>
                <input type="checkbox" checked={billingSame} onChange={(e) => setBillingSame(e.target.checked)} />
                Billing address is the same
              </label>
              {!billingSame && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <h3>Billing address</h3>
                  <AddressFields value={billing} onChange={setBilling} />
                </div>
              )}
              {address.postcode && quoteData && !quoteData.deliverySupported && (
                <p className="field-error" role="alert">Sorry — we don’t deliver to postcode {address.postcode}. Use a different delivery address.</p>
              )}
              <div className="row mt-4">
                <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
                <Button className="grow" disabled={!addressValid || (quoteData ? !quoteData.deliverySupported : false)} onClick={() => setStep(2)}>Continue</Button>
              </div>
            </div>
          )}

          {/* ---------------- step 2: loyalty ---------------- */}
          {step === 2 && (
            <div className="card card-pad">
              <h2>Loyalty coins</h2>
              {customer ? (
                <>
                  <p className="small muted">Redeem 100 coins = $1 off (sample rule, in steps of 10). Coins shown include held coins.</p>
                  <Field label={`Coins to redeem (available: ${quoteData?.maxRedeemableCoins ?? 0})`} htmlFor="coins">
                    <input
                      id="coins" className="input" type="number" min={0}
                      max={quoteData?.maxRedeemableCoins ?? 0} step={10}
                      value={coins} onChange={(e) => setCoins(Math.max(0, Math.min(Number(e.target.value) || 0, quoteData?.maxRedeemableCoins ?? 0)))}
                    />
                  </Field>
                  <p className="small">Discount applied: <strong>{formatAud(Math.floor((coins / 100) * 100))}</strong></p>
                  <div className="row">
                    <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
                    <Button className="grow" onClick={() => setStep(3)}>Review order</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="small muted">Loyalty coins require an account. <Link to="/login?next=/checkout">Sign in</Link> or continue without coins.</p>
                  <div className="row">
                    <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
                    <Button className="grow" onClick={() => setStep(3)}>Review order</Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ---------------- step 3: review ---------------- */}
          {step === 3 && (
            <div className="stack">
              <div className="card card-pad">
                <div className="row-between">
                  <h2 className="mb-0">Review &amp; pay</h2>
                </div>
                {quoteData?.stockIssues && quoteData.stockIssues.length > 0 && (
                  <div className="card card-pad mt-2" style={{ borderColor: 'var(--warn-700)', background: 'var(--warn-100)' }} role="alert">
                    <strong>Stock changed:</strong>
                    <ul className="small" style={{ margin: '6px 0 0' }}>
                      {quoteData.stockIssues.map((s) => (
                        <li key={s.skuId}>{s.productName}: requested {s.requested}, only {s.available} available. <Link to="/cart">Edit cart</Link></li>
                      ))}
                    </ul>
                  </div>
                )}
                {outOfStockLines.length > 0 && (
                  <div className="card card-pad mt-2" style={{ borderColor: 'var(--danger-600)' }} role="alert">
                    <strong>Remove out-of-stock items:</strong>{' '}
                    {outOfStockLines.map((l) => l.productName).join(', ')} — <Link to="/cart">go to cart</Link>.
                  </div>
                )}
                <div className="cart-line">
                  <div className="grow small">
                    <strong>{contact.name}</strong> · {contact.email}<br />
                    {address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.suburb} {address.state} {address.postcode}
                    <div className="mt-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>Edit address</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setStep(0)}>Edit contact</button>
                    </div>
                  </div>
                </div>
                {cart.lines.filter(isAvailableLine).map((l) => (
                  <div className="cart-line" key={l.skuId}>
                    <ProductImage glyph={l.imageGlyph!} hue={l.imageHue!} size="sm" alt={l.productName!} />
                    <div className="grow row-between wrap">
                      <span>{l.productName} × {l.quantity}</span>
                      <Price cents={l.lineTotalCents!} />
                    </div>
                  </div>
                ))}
                <div className="mt-4">
                  <Button
                    block loading={begin.isPending} disabled={!canPay}
                    onClick={() => begin.mutate()}
                  >
                    {totals ? `Pay ${formatAud(totals.totalCents)}` : 'Pay'} — simulated payment
                  </Button>
                  <p className="xsmall muted mt-2 mb-0" style={{ textAlign: 'center' }}>
                    Demo environment: the next step simulates payment outcomes (success / decline / pending). No real money moves. Starting payment holds stock for 15 minutes.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ---------------- totals panel ---------------- */}
        <div className="card card-pad">
          <h3>Order summary</h3>
          {quote.isPending && <Loading label="Updating totals…" />}
          {totals && (
            <div className="summary-rows">
              <div><span>Subtotal</span><Price cents={totals.subtotalCents} /></div>
              {totals.coinDiscountCents > 0 && (
                <div><span>Coins redeemed</span><span className="price">−{formatAud(totals.coinDiscountCents)}</span></div>
              )}
              <div>
                <span>Delivery</span>
                <span>{totals.shippingCents === 0 ? 'FREE' : formatAud(totals.shippingCents)}</span>
              </div>
              <div className="small muted"><span>Includes GST (sample)</span><span>{formatAud(totals.gstIncludedCents)}</span></div>
              <div className="summary-total"><span>Total</span><span>{formatAud(totals.totalCents)}</span></div>
              {totals.coinsEarned > 0 && (
                <div className="coins-chip">🪙 You'll earn ~{totals.coinsEarned} coins {customer ? '' : '(sign in to earn)'}</div>
              )}
            </div>
          )}
          <hr className="divider" />
          <p className="xsmall muted mb-0">
            Totals are calculated by the service and re-validated at payment. If prices or stock change, you'll be asked to accept revised totals before paying.
          </p>
        </div>
      </div>

      {/* ---------------- simulated payment dialog ---------------- */}
      <Modal open={payOpen && !!placedAttempt} onClose={() => { setPayOpen(false); }} title="Simulated payment (demo)">
        <p className="small">
          Attempt <span className="kbd">{placedAttempt?.id}</span> · <strong>{formatAud(placedAttempt?.totalCents ?? 0)}</strong><br />
          Reservation expires <Countdown iso={placedAttempt?.reservationExpiresAt} />.
        </p>
        <p className="small muted">
          In production this is a provider-hosted, tokenised payment component. Choose an outcome to simulate it.
        </p>
        <div className="stack">
          <Button block loading={pay.isPending} onClick={() => pay.mutate('SUCCESS')}>✅ Simulate successful payment</Button>
          <Button block variant="secondary" onClick={() => pay.mutate('FAILED')}>❌ Simulate declined card</Button>
          <Button block variant="ghost" onClick={() => pay.mutate('PENDING')}>⏳ Simulate pending payment</Button>
          <Button block variant="ghost" onClick={() => { api.cancelCheckout(placedAttempt!.id).finally(() => { setPayOpen(false); qc.invalidateQueries({ queryKey: ['cart'] }); }); }}>
            Cancel checkout (releases stock &amp; coins)
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function AddressFields({ value, onChange }: { value: AddressForm; onChange: (v: AddressForm) => void }) {
  const set = (patch: Partial<AddressForm>) => onChange({ ...value, ...patch });
  return (
    <>
      <Field label="Recipient name" htmlFor="ad-name">
        <input id="ad-name" className="input" value={value.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" required />
      </Field>
      <Field label="Phone" htmlFor="ad-phone">
        <input id="ad-phone" className="input" type="tel" value={value.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" required />
      </Field>
      <Field label="Street address" htmlFor="ad-line1">
        <input id="ad-line1" className="input" value={value.line1} onChange={(e) => set({ line1: e.target.value })} autoComplete="address-line1" required />
      </Field>
      <Field label="Apartment, unit (optional)" htmlFor="ad-line2">
        <input id="ad-line2" className="input" value={value.line2} onChange={(e) => set({ line2: e.target.value })} autoComplete="address-line2" />
      </Field>
      <div className="row">
        <Field label="Suburb" htmlFor="ad-suburb">
          <input id="ad-suburb" className="input" value={value.suburb} onChange={(e) => set({ suburb: e.target.value })} autoComplete="address-level2" required />
        </Field>
        <Field label="State" htmlFor="ad-state">
          <select id="ad-state" className="select" value={value.state} onChange={(e) => set({ state: e.target.value })} required>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Postcode" htmlFor="ad-post" hint="4 digits">
          <input id="ad-post" className="input" inputMode="numeric" pattern="\d{4}" maxLength={4} value={value.postcode} onChange={(e) => set({ postcode: e.target.value.replace(/\D/g, '') })} autoComplete="postal-code" required />
        </Field>
      </div>
    </>
  );
}

export function Countdown({ iso, onZero }: { iso?: string; onZero?: () => void }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return;
    const tick = () => {
      const ms = new Date(iso).getTime() - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) onZero?.();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [iso]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!iso || remaining == null) return <span>—</span>;
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return <span className="paytimer">{m}:{String(s).padStart(2, '0')}</span>;
}

export { Badge };

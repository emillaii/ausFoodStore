import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, ErrorState, Field, Loading } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { Customer, Order } from '@aus/contracts';

/** Staff-created order: find/create customer, add SKUs, addresses, authorised discount, draft → invoice/payment. */
export default function ManualOrder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['admin-customers', ''], queryFn: () => api.admin.customers() });

  const [customerId, setCustomerId] = useState('');
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [address, setAddress] = useState({ name: '', phone: '', line1: '', line2: '', suburb: '', state: 'NSW', postcode: '' });
  const [lines, setLines] = useState<{ skuId: string; label: string; unitPriceCents: number; quantity: number }[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Order | null>(null);

  const skuOptions = useQuery({
    queryKey: ['sku-options', skuSearch],
    queryFn: () => api.admin.products({ q: skuSearch, pageSize: 8 }),
    enabled: skuSearch.trim().length >= 2,
  });

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    const c = (customers.data?.items ?? []).find((x: Customer) => x.id === id);
    if (c) {
      setContact({ name: `${c.firstName} ${c.lastName}`, email: c.email, phone: c.phone ?? '' });
      setAddress((a) => ({ ...a, name: `${c.firstName} ${c.lastName}`, phone: c.phone ?? '' }));
    }
  };

  const addLine = (skuId: string, label: string, unitPriceCents: number) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.skuId === skuId);
      if (existing) return prev.map((l) => (l.skuId === skuId ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { skuId, label, unitPriceCents, quantity: 1 }];
    });
  };

  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const afterDiscount = Math.max(0, subtotal - discount * 100);
  const shipping = afterDiscount >= 7500 || afterDiscount === 0 ? 0 : 990;
  const total = afterDiscount + shipping;

  const saveDraft = useMutation({
    mutationFn: async () => api.admin.createManualOrder({
      customerId: customerId || undefined,
      contactName: contact.name, contactEmail: contact.email, contactPhone: contact.phone,
      shippingAddress: address,
      lines: lines.map((l) => ({ skuId: l.skuId, quantity: l.quantity })),
      discountCents: discount * 100 || undefined,
      notes: notes || undefined,
    }),
    onSuccess: (order: Order) => {
      qc.invalidateQueries();
      setCreated(order);
    },
    onError: (e) => setError((e as ApiClientError).message),
  });

  if (created) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div className="card card-pad" role="status">
          <h1>Draft {created.number} created</h1>
          <p className="small muted">Total <strong>{formatAud(created.totalCents)}</strong>. Draft orders and unpaid invoices do not reserve stock (prototype default §7.4).</p>
          <div className="row wrap">
            <Button variant="secondary" onClick={async () => { await api.admin.issueInvoice(created.id); qc.invalidateQueries(); navigate(`/orders/${created.id}`); }}>Issue invoice now</Button>
            <Button variant="ghost" onClick={() => navigate(`/orders/${created.id}`)}>Open order →</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head"><h1>New order (manual)</h1></div>
      {error && <div className="card card-pad mb-4" role="alert" style={{ borderColor: 'var(--danger-600)' }}>{error}</div>}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <div className="stack">
          <div className="card card-pad">
            <h3>Customer</h3>
            <Field label="Existing customer" htmlFor="mo-cust">
              <select id="mo-cust" className="select" value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">— New / walk-in customer —</option>
                {(customers.data?.items ?? []).map((c: Customer) => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.email})</option>
                ))}
              </select>
            </Field>
            <Field label="Contact name" htmlFor="mo-name"><input id="mo-name" className="input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
            <Field label="Contact email" htmlFor="mo-email"><input id="mo-email" className="input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
            <Field label="Contact phone" htmlFor="mo-phone"><input id="mo-phone" className="input" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
          </div>

          <div className="card card-pad">
            <h3>Delivery address</h3>
            <Field label="Recipient" htmlFor="mo-an"><input id="mo-an" className="input" value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} /></Field>
            <Field label="Street" htmlFor="mo-a1"><input id="mo-a1" className="input" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} /></Field>
            <div className="row">
              <Field label="Suburb" htmlFor="mo-sub"><input id="mo-sub" className="input" value={address.suburb} onChange={(e) => setAddress({ ...address, suburb: e.target.value })} /></Field>
              <Field label="State" htmlFor="mo-st">
                <select id="mo-st" className="select" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })}>
                  {['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Postcode" htmlFor="mo-pc"><input id="mo-pc" className="input" inputMode="numeric" maxLength={4} value={address.postcode} onChange={(e) => setAddress({ ...address, postcode: e.target.value.replace(/\D/g, '') })} /></Field>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad">
            <h3>Items</h3>
            <Field label="Find SKU or product" htmlFor="mo-sku" hint="Type at least 2 characters">
              <input id="mo-sku" className="input" value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)} placeholder="e.g. MLK-WHM-2L or milk" />
            </Field>
            {skuOptions.isLoading && <Loading />}
            {(skuOptions.data?.items ?? []).flatMap((p: { id: string; name: string; skus: { id: string; code: string; priceCents: number; packSize?: string }[] }) =>
              p.skus.filter((s) => !skuSearch || s.code.toLowerCase().includes(skuSearch.toLowerCase()) || p.name.toLowerCase().includes(skuSearch.toLowerCase())).map((s) => (
                <button key={s.id} className="suggest-item" onClick={() => { addLine(s.id, `${p.name} · ${s.code}`, s.priceCents); setSkuSearch(''); }}>
                  <span className="grow">{p.name} <span className="muted small">{s.code}{s.packSize ? ` · ${s.packSize}` : ''}</span></span>
                  <span>{formatAud(s.priceCents)}</span>
                </button>
              )),
            )}
            {lines.length === 0 && <p className="small muted">No lines yet.</p>}
            {lines.map((l, i) => (
              <div className="row-between small" key={l.skuId} style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                <span className="grow">{l.label}</span>
                <input
                  className="input input-sm" style={{ width: 70 }} type="number" min={1} max={99} aria-label={`Quantity for ${l.label}`}
                  value={l.quantity}
                  onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))}
                />
                <span style={{ width: 70, textAlign: 'right' }}>{formatAud(l.unitPriceCents * l.quantity)}</span>
                <Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>✕</Button>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <h3>Discount &amp; notes</h3>
            <Field label="Authorised discount (AUD)" htmlFor="mo-disc" hint="Requires approval per policy — recorded in audit">
              <input id="mo-disc" className="input" type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Internal note" htmlFor="mo-notes">
              <textarea id="mo-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Phone order, discount approved by Sarah (ADMIN)" />
            </Field>
            <div className="summary-rows">
              <div><span>Subtotal</span><span>{formatAud(subtotal)}</span></div>
              {discount > 0 && <div><span>Discount</span><span>−{formatAud(discount * 100)}</span></div>}
              <div><span>Delivery</span><span>{shipping === 0 ? 'FREE' : formatAud(shipping)}</span></div>
              <div className="summary-total"><span>Total</span><span>{formatAud(total)}</span></div>
            </div>
            <Button
              block className="mt-4" loading={saveDraft.isPending}
              disabled={!contact.name || !contact.email || !address.line1 || !address.suburb || lines.length === 0}
              onClick={() => { setError(null); saveDraft.mutate(); }}
            >
              Save draft order
            </Button>
            <p className="xsmall muted mt-2 mb-0">Drafts don't reserve stock. Issue an invoice, record offline payment (ADMIN/FINANCE), or create a payment link from the order page.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

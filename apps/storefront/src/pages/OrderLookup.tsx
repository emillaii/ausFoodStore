import { useState } from 'react';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { Button, ErrorState, Field } from '@aus/ui';
import type { Order } from '@aus/contracts';
import { StatusBadge, Price } from '@aus/ui';

/** Guest order lookup: order number + email + access code are ALL required (§6.4). */
export default function OrderLookup() {
  const [form, setForm] = useState({ orderNumber: '', email: '', accessCode: '' });
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setOrder(await api.guestOrderLookup(form.orderNumber.trim().toUpperCase(), form.email.trim(), form.accessCode.trim()));
    } catch (err) {
      setError(err as ApiClientError);
      setOrder(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1>Find a guest order</h1>
      <p className="muted small">All three details are required together — knowing an order ID alone is never enough (demo implementation of the scoped access mechanism).</p>
      <form onSubmit={submit} className="card card-pad" noValidate>
        <Field label="Order number" htmlFor="g-number"><input id="g-number" className="input" value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} placeholder="ORD-1009" required /></Field>
        <Field label="Email used at checkout" htmlFor="g-email"><input id="g-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Access code" htmlFor="g-code" hint="Shown once at order confirmation"><input id="g-code" className="input" value={form.accessCode} onChange={(e) => setForm({ ...form, accessCode: e.target.value })} required /></Field>
        <Button block type="submit" loading={busy}>Find order</Button>
      </form>
      {error && <div className="mt-4"><ErrorState title="Order not accessible" error={error} /></div>}
      {order && (
        <div className="card card-pad mt-4">
          <div className="row-between">
            <strong>{order.number}</strong>
            <span><StatusBadge status={order.paymentStatus} /> <StatusBadge status={order.fulfilmentStatus} /></span>
          </div>
          <div className="small muted">{order.lines.length} lines · placed {new Date(order.placedAt).toLocaleDateString('en-AU')}</div>
          <div className="mt-2"><Price cents={order.totalCents} /></div>
          {order.shipments.map((s) => (
            <p className="small mt-2 mb-0" key={s.id}>
              Shipment: {s.carrier} · tracking <span className="kbd">{s.trackingNumber}</span> · {s.state === 'DISPATCHED' ? 'dispatched' : s.state.toLowerCase()}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

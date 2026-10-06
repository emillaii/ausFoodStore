import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, ErrorState, Field, Loading, Modal, Price, ProductImage, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { Order, ReturnRequest } from '@aus/contracts';

export default function AccountOrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: order, isLoading, error, refetch } = useQuery<Order, ApiClientError>({
    queryKey: ['order', id],
    queryFn: () => api.order(id!),
  });

  const [returnOpen, setReturnOpen] = useState(false);
  const [reorderMsg, setReorderMsg] = useState<string | null>(null);

  const reorder = useMutation({
    mutationFn: () => api.reorder(id!),
    onSuccess: (res: { added: string[]; unavailable: { name: string; reason: string }[] }) => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      const parts: string[] = [];
      if (res.added.length) parts.push(`Added ${res.added.length} item(s) back to your cart at today's prices.`);
      if (res.unavailable.length) parts.push(`Unavailable: ${res.unavailable.map((u) => `${u.name} (${u.reason})`).join(', ')}.`);
      setReorderMsg(parts.join(' ') || 'Nothing to add.');
    },
    onError: (e) => setReorderMsg((e as ApiClientError).message),
  });

  if (isLoading) return <Loading label="Loading order…" />;
  if (error) return <ErrorState title="Order unavailable" error={error} onRetry={() => refetch()} />;
  if (!order) return null;

  const returnable = order.lines.filter((l) => l.quantity - l.refundedQty > 0 && ['SHIPPED', 'DELIVERED', 'PARTIALLY_SHIPPED'].includes(order.fulfilmentStatus));

  return (
    <div>
      <nav className="small muted" aria-label="Breadcrumb"><Link to="/account/orders">Order history</Link> › {order.number}</nav>
      <div className="row-between wrap mt-2">
        <h1 className="mb-0">{order.number}</h1>
        <div className="row wrap">
          <span className="small muted">Payment</span> <StatusBadge status={order.paymentStatus} />
          <span className="small muted">Fulfilment</span> <StatusBadge status={order.fulfilmentStatus} />
        </div>
      </div>
      <p className="muted small">Placed {new Date(order.placedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</p>

      {order.exception && (
        <div className="card card-pad mt-2" style={{ borderColor: 'var(--warn-700)', background: 'var(--warn-100)' }} role="alert">
          <strong>Payment/stock exception:</strong> payment arrived after the reservation expired. Stock could not be secured, so the order was cancelled and the payment voided/refunded automatically (simulated provider action).
        </div>
      )}

      <div className="row mt-4 wrap" style={{ gap: 8 }}>
        <Button variant="secondary" loading={reorder.isPending} onClick={() => reorder.mutate()}>Reorder</Button>
        {returnable.length > 0 && <Button variant="secondary" onClick={() => setReturnOpen(true)}>Request a return</Button>}
      </div>
      {reorderMsg && <p className="small mt-2" role="status">{reorderMsg}</p>}

      <div className="card card-pad mt-4">
        <h3>Items</h3>
        {order.lines.map((l) => (
          <div className="cart-line" key={l.id}>
            <ProductImage glyph={l.imageGlyph} hue={l.imageHue} size="sm" alt={l.productName} />
            <div className="grow row-between wrap">
              <div>
                <strong>{l.productName}</strong>
                <div className="small muted">{l.optionSummary || l.packSize} · {l.skuCode} · {formatAud(l.unitPriceCents)} each</div>
                <div className="small muted">
                  {l.shippedQty > 0 && <>Shipped {l.shippedQty} of {l.quantity}. </>}
                  {l.refundedQty > 0 && <Badge tone="info">Refunded {l.refundedQty}</Badge>}
                  {l.exception === 'SHORT_PICKED' && <Badge tone="warn">Short-picked</Badge>}
                  {l.exception === 'CANCELLED' && <Badge tone="danger">Line cancelled</Badge>}
                </div>
              </div>
              <Price cents={l.lineTotalCents} />
            </div>
          </div>
        ))}
        <div className="summary-rows mt-4">
          <div><span>Subtotal</span><Price cents={order.subtotalCents} /></div>
          {order.manualDiscountCents > 0 && <div><span>Staff discount</span><span>−{formatAud(order.manualDiscountCents)}</span></div>}
          {order.coinDiscountCents > 0 && <div><span>Coins redeemed</span><span>−{formatAud(order.coinDiscountCents)}</span></div>}
          <div><span>Delivery</span><span>{order.shippingCents === 0 ? 'FREE' : formatAud(order.shippingCents)}</span></div>
          <div className="small muted"><span>Includes GST (sample)</span><span>{formatAud(order.gstIncludedCents)}</span></div>
          <div className="summary-total"><span>Total</span><span>{formatAud(order.totalCents)}</span></div>
        </div>
      </div>

      <div className="card card-pad mt-4">
        <h3>Payment history</h3>
        {order.payments.length === 0 && <p className="small muted mb-0">No payment recorded yet.</p>}
        {order.payments.map((p) => (
          <div className="row-between small" key={p.id}>
            <span>{p.method === 'CARD_DEMO' ? 'Card (simulated)' : p.method === 'OFFLINE' ? `Offline payment · ${p.reference ?? ''}` : 'Payment link (simulated)'} · {new Date(p.createdAt).toLocaleDateString('en-AU')}</span>
            <span><StatusBadge status={p.status} /> {formatAud(p.amountCents)}</span>
          </div>
        ))}
        {order.refunds.length > 0 && (
          <>
            <h3 className="mt-4">Refunds</h3>
            {order.refunds.map((r) => (
              <div className="row-between small" key={r.id}>
                <span>{r.reason} · {r.creditNoteNumber ?? ''}</span>
                <span><StatusBadge status={r.status} /> {formatAud(r.amountCents)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {order.shipments.length > 0 && (
        <div className="card card-pad mt-4">
          <h3>Shipments</h3>
          {order.shipments.map((s) => (
            <div className="row-between small" key={s.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <span>
                <StatusBadge status={s.state === 'DISPATCHED' ? 'SHIPPED' : s.state} /> {s.carrier} · {s.service}<br />
                <span className="muted">Tracking: <span className="kbd">{s.trackingNumber}</span></span>
              </span>
              <span className="muted">{s.items.reduce((n, i) => n + i.quantity, 0)} item(s)</span>
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad mt-4">
        <h3>Documents</h3>
        <div className="stack small">
          {order.documents.map((d) => (
            <div className="row-between" key={d.id}>
              <span>{d.type.replaceAll('_', ' ')} · <span className="kbd">{d.number}</span></span>
              <span className="muted">{new Date(d.createdAt).toLocaleDateString('en-AU')}</span>
            </div>
          ))}
          {order.documents.length === 0 && <p className="muted mb-0">No documents yet.</p>}
        </div>
        <p className="xsmall muted mt-2 mb-0">Documents marked Demo are printable previews; no real emails or PDFs are sent.</p>
      </div>

      {order.returns.length > 0 && (
        <div className="card card-pad mt-4">
          <h3>Return requests</h3>
          {order.returns.map((r) => (
            <div className="small" key={r.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <div className="row-between">
                <strong>{r.items.map((i) => `${i.quantity} × ${order.lines.find((l) => l.id === i.lineId)?.productName ?? 'item'}`).join(', ')}</strong>
                <StatusBadge status={r.status} />
              </div>
              <div className="muted">Reason: {r.items[0].reason}</div>
              {r.decisionReason && <div className="muted">Decision: {r.decisionReason}</div>}
              {r.refund && <div className="muted">Refund {formatAud(r.refund.amountCents)} · credit note {r.refund.creditNoteNumber}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad mt-4">
        <h3>Delivery snapshot</h3>
        <p className="small mb-0">
          {order.shippingAddress.name}<br />
          {order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}<br />
          {order.shippingAddress.suburb} {order.shippingAddress.state} {order.shippingAddress.postcode}<br />
          {order.shippingAddress.phone}
        </p>
        <p className="xsmall muted mt-2 mb-0">Historical snapshot — editing your address book later won't change this order.</p>
      </div>

      <ReturnModal open={returnOpen} onClose={() => setReturnOpen(false)} order={order} onDone={() => { setReturnOpen(false); refetch(); }} />
    </div>
  );
}

function ReturnModal({ open, onClose, order, onDone }: { open: boolean; onClose: () => void; order: Order; onDone: () => void }) {
  const returnable = order.lines.filter((l) => l.quantity - l.refundedQty > 0);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const items = Object.entries(selection)
      .filter(([, qty]) => qty > 0)
      .map(([lineId, qty]) => ({ lineId, quantity: qty, reason }));
    if (items.length === 0) return setError('Select at least one line and quantity.');
    if (!reason.trim()) return setError('Please provide a reason.');
    setBusy(true);
    try {
      await api.createReturn(order.id, items);
      onDone();
    } catch (e) {
      setError((e as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Request return — ${order.number}`}>
      <p className="small muted">Pick the lines and quantities to return. Staff review each request; refunds are only issued after approval (demo flow).</p>
      {returnable.map((l) => {
        const max = l.quantity - l.refundedQty;
        return (
          <div className="row-between" key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="small">{l.productName} <span className="muted">(up to {max})</span></span>
            <select
              className="select input-sm" style={{ width: 90 }}
              value={selection[l.id] ?? 0}
              onChange={(e) => setSelection({ ...selection, [l.id]: Number(e.target.value) })}
              aria-label={`Quantity to return for ${l.productName}`}
            >
              <option value={0}>0</option>
              {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        );
      })}
      <Field label="Reason" htmlFor="ret-reason" error={error ?? undefined}>
        <textarea id="ret-reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in transit" />
      </Field>
      <Button block loading={busy} onClick={submit}>Submit return request</Button>
    </Modal>
  );
}

export type { ReturnRequest };

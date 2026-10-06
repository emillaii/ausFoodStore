import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useStaff } from '../lib/staff';
import { DocumentPreview } from '../components/DocumentPreview';
import { Badge, Button, ErrorState, Field, Loading, Modal, Price, ProductImage, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { Order, Shipment } from '@aus/contracts';

export default function OrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { staff } = useStaff();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const { data: order, isLoading, error: loadError, refetch } = useQuery<Order, ApiClientError>({
    queryKey: ['admin-order', id],
    queryFn: () => api.admin.order(id!),
    refetchInterval: 15_000,
  });

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => { await fn(); },
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['admin-order', id] }); },
    onError: (e) => setError((e as ApiClientError).message),
  });

  if (isLoading) return <Loading />;
  if (loadError) return <ErrorState error={loadError} onRetry={() => refetch()} />;
  if (!order) return null;

  const remainingShippable = (lineId: string) => {
    const line = order.lines.find((l) => l.id === lineId)!;
    return Math.max(0, Math.min(line.pickedQty, line.quantity) - line.shippedQty);
  };
  const anyShippable = order.lines.some((l) => remainingShippable(l.id) > 0);
  const hasShortPick = order.lines.some((l) => l.exception === 'SHORT_PICKED');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{order.number}</h1>
          <p className="small muted mb-0">
            {order.contact.name} · {order.contact.email} · placed {new Date(order.placedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
            {order.createdBy && <> · created by {order.createdBy}</>}
          </p>
        </div>
        <div className="row wrap">
          <span className="small muted">Payment</span><StatusBadge status={order.paymentStatus} />
          <span className="small muted">Fulfilment</span><StatusBadge status={order.fulfilmentStatus} />
          {order.exception && <Badge tone="danger">Exception: {order.exception.replaceAll('_', ' ')}</Badge>}
        </div>
      </div>

      {message && <p className="small" role="status" style={{ color: 'var(--success-700)' }}>{message}</p>}
      {error && <div className="card card-pad mb-4" role="alert" style={{ borderColor: 'var(--danger-600)' }}>{error}</div>}

      {/* ------------ permitted next actions ------------ */}
      <div className="card card-pad mb-4">
        <h3 className="mb-2">Actions</h3>
        <div className="row wrap">
          {order.fulfilmentStatus === 'DRAFT' && (
            <Button loading={act.isPending} onClick={() => act.mutate(() => api.admin.issueInvoice(order.id))}>Issue invoice</Button>
          )}
          {['DRAFT', 'INVOICE_ISSUED'].includes(order.fulfilmentStatus) && order.paymentStatus !== 'PAID' && (
            <>
              <Button variant="secondary" onClick={() => setOfflineOpen(true)}>Record offline payment</Button>
              <Button variant="secondary" loading={act.isPending} onClick={() => act.mutate(async () => { const r = await api.admin.paymentLink(order.id) as { link: string }; setMessage(`Simulated payment link created: ${r.link} (no email sent — demo)`); })}>
                Create payment link (sim)
              </Button>
            </>
          )}
          {order.paymentStatus === 'PAID' && order.fulfilmentStatus === 'READY_TO_PICK' && (
            <Button loading={act.isPending} onClick={() => act.mutate(() => api.admin.startPicking(order.id))}>Start picking</Button>
          )}
          {order.paymentStatus === 'PAID' && ['PICKED', 'PICKING', 'PARTIALLY_SHIPPED'].includes(order.fulfilmentStatus) && !hasShortPick && (
            <Button loading={act.isPending} onClick={() => act.mutate(() => api.admin.pack(order.id))}>Mark packed</Button>
          )}
          {anyShippable && order.paymentStatus === 'PAID' && (
            <Button variant="secondary" onClick={() => setShipOpen(true)}>Create shipment</Button>
          )}
          {['DRAFT', 'INVOICE_ISSUED', 'READY_TO_PICK', 'PICKING', 'PICKED', 'PACKED'].includes(order.fulfilmentStatus) && (
            <Button variant="ghost" loading={act.isPending} onClick={() => { if (confirm(`Cancel ${order.number}? Outstanding holds are released and paid amounts refunded (simulated).`)) act.mutate(() => api.admin.cancelOrder(order.id)); }}>
              Cancel order
            </Button>
          )}
          <Link className="btn btn-ghost" to={`/fulfilment/${order.id}`}>Open in fulfilment →</Link>
        </div>
        {order.fulfilmentStatus === 'INVOICE_ISSUED' && (
          <p className="xsmall muted mt-2 mb-0">Invoice issued before payment — no stock reserved, no payment recorded (§7.4 default).</p>
        )}
      </div>

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        {/* ------------ items ------------ */}
        <div className="card card-pad">
          <h3>Items (snapshot)</h3>
          {order.lines.map((l) => (
            <div className="cart-line" key={l.id}>
              <ProductImage glyph={l.imageGlyph} hue={l.imageHue} size="sm" alt={l.productName} />
              <div className="grow">
                <div className="row-between wrap">
                  <div>
                    <strong>{l.productName}</strong>
                    <div className="xsmall muted">{l.skuCode}{l.optionSummary ? ` · ${l.optionSummary}` : ''} · {formatAud(l.unitPriceCents)} ea</div>
                  </div>
                  <Price cents={l.lineTotalCents} />
                </div>
                <div className="xsmall muted mt-2">
                  qty {l.quantity} · picked {l.pickedQty} · shipped {l.shippedQty}{l.refundedQty ? ` · refunded ${l.refundedQty}` : ''}
                  {l.exception !== 'NONE' && <> · <Badge tone={l.exception === 'SHORT_PICKED' ? 'warn' : 'danger'}>{l.exception.replaceAll('_', ' ').toLowerCase()}</Badge></>}
                </div>
              </div>
            </div>
          ))}
          <div className="summary-rows mt-4">
            <div><span>Subtotal</span><Price cents={order.subtotalCents} /></div>
            {order.manualDiscountCents > 0 && <div><span>Authorised discount</span><span>−{formatAud(order.manualDiscountCents)}</span></div>}
            {order.coinDiscountCents > 0 && <div><span>Coins redeemed</span><span>−{formatAud(order.coinDiscountCents)}</span></div>}
            <div><span>Delivery</span><span>{order.shippingCents === 0 ? 'FREE' : formatAud(order.shippingCents)}</span></div>
            <div className="small muted"><span>Includes GST (sample)</span><span>{formatAud(order.gstIncludedCents)}</span></div>
            <div className="summary-total"><span>Total</span><span>{formatAud(order.totalCents)}</span></div>
          </div>
        </div>

        <div className="stack">
          {/* ------------ payment ------------ */}
          <div className="card card-pad">
            <h3>Payment history</h3>
            {order.payments.length === 0 && <p className="small muted mb-0">No payments yet.</p>}
            {order.payments.map((p) => (
              <div className="row-between small" key={p.id} style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                <span>
                  {p.method === 'CARD_DEMO' ? 'Card (simulated)' : p.method === 'OFFLINE' ? `Offline · ref ${p.reference}` : 'Payment link (simulated)'}
                  <div className="xsmall muted">{new Date(p.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}{p.recordedBy ? ` · ${p.recordedBy}` : ''}</div>
                </span>
                <span><StatusBadge status={p.status} /> <strong>{formatAud(p.amountCents)}</strong>{p.refundedCents > 0 && <span className="muted"> (−{formatAud(p.refundedCents)})</span>}</span>
              </div>
            ))}
            {order.refunds.length > 0 && (
              <>
                <h3 className="mt-4">Refunds</h3>
                {order.refunds.map((r) => (
                  <div className="row-between small" key={r.id}>
                    <span>{r.reason}<div className="xsmall muted">{r.creditNoteNumber} · by {r.requestedBy}</div></span>
                    <span><StatusBadge status={r.status} /> {formatAud(r.amountCents)}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* ------------ shipments ------------ */}
          <div className="card card-pad">
            <h3>Shipments</h3>
            {order.shipments.length === 0 && <p className="small muted mb-0">No shipments yet.</p>}
            {order.shipments.map((s) => (
              <div className="small" key={s.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
                <div className="row-between">
                  <span><StatusBadge status={s.state} /> {s.carrier} · {s.service} · <span className="kbd">{s.trackingNumber}</span></span>
                  {s.state === 'CREATED' && (
                    <Button size="sm" onClick={() => act.mutate(() => api.admin.dispatch(order.id, s.id))}>Dispatch</Button>
                  )}
                </div>
                <div className="xsmall muted mt-2">
                  {s.items.map((i) => {
                    const l = order.lines.find((x) => x.id === i.lineId);
                    return `${i.quantity} × ${l?.skuCode ?? i.lineId.slice(-6)}`;
                  }).join(', ')}
                </div>
              </div>
            ))}
          </div>

          {/* ------------ documents ------------ */}
          <div className="card card-pad">
            <h3>Documents</h3>
            <div className="stack small">
              {order.documents.map((d) => (
                <div className="row-between" key={d.id}>
                  <span>{d.type.replaceAll('_', ' ')} <span className="kbd">{d.number}</span></span>
                  <Button size="sm" variant="ghost" onClick={() => setDocPreview(d.id)}>Preview</Button>
                </div>
              ))}
              {order.documents.length === 0 && <p className="muted mb-0">None issued yet.</p>}
            </div>
            <details className="mt-3">
              <summary className="small" style={{ cursor: 'pointer' }}>Issue another document</summary>
              <div className="row wrap mt-2">
                {(['ORDER_CONFIRMATION', 'INVOICE', 'RECEIPT', 'PACKING_SLIP', 'CREDIT_NOTE'] as const).map((t) => (
                  <Button key={t} size="sm" variant="secondary" onClick={() => act.mutate(async () => { await api.admin.issueDocument(order.id, t); setMessage(`${t.replaceAll('_', ' ')} issued.`); })}>
                    + {t.replaceAll('_', ' ').toLowerCase()}
                  </Button>
                ))}
              </div>
            </details>
          </div>

          {/* ------------ addresses ------------ */}
          <div className="card card-pad">
            <h3>Address snapshots</h3>
            <p className="small mb-0">
              <strong>Delivery:</strong> {order.shippingAddress.name}, {order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}, {order.shippingAddress.suburb} {order.shippingAddress.state} {order.shippingAddress.postcode}
            </p>
            {order.billingAddress && (
              <p className="small mb-0 mt-2">
                <strong>Billing:</strong> {order.billingAddress.line1}, {order.billingAddress.suburb} {order.billingAddress.state}
              </p>
            )}
            <p className="xsmall muted mt-2 mb-0">Snapshots are frozen — customer profile edits don't change them.</p>
          </div>

          {/* ------------ internal notes ------------ */}
          <div className="card card-pad">
            <h3>Internal notes <Badge tone="neutral">staff only</Badge></h3>
            <div className="row">
              <input className="input input-sm grow" placeholder="Add an internal note…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Internal note" />
              <Button size="sm" disabled={!note.trim()} loading={act.isPending} onClick={() => { act.mutate(() => api.admin.addOrderNote(order.id, note)); setNote(''); }}>Add</Button>
            </div>
            <div className="mt-3">
              {(order.internalNotes ?? []).map((n) => (
                <div className="small" key={n.id} style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                  <strong>{n.authorName}</strong> <span className="muted xsmall">{new Date(n.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <div>{n.body}</div>
                </div>
              ))}
              {(order.internalNotes ?? []).length === 0 && <p className="small muted mb-0">No notes.</p>}
            </div>
          </div>

          {/* ------------ timeline ------------ */}
          <div className="card card-pad">
            <h3>Audit timeline</h3>
            <ul className="timeline small">
              <li>
                <div>Order placed — {order.contact.name}</div>
                <div className="when">{new Date(order.placedAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</div>
              </li>
              {order.payments.map((p) => (
                <li key={p.id}>
                  <div>Payment {p.status.toLowerCase()} ({p.method === 'CARD_DEMO' ? 'card sim' : p.method.toLowerCase()})</div>
                  <div className="when">{new Date(p.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</div>
                </li>
              ))}
              {order.shipments.map((s: Shipment) => (
                <li key={s.id}>
                  <div>Shipment {s.trackingNumber} {s.state.toLowerCase()}</div>
                  <div className="when">{new Date(s.dispatchedAt ?? s.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</div>
                </li>
              ))}
              {order.documents.map((d) => (
                <li key={d.id}>
                  <div>Document {d.number} issued{d.createdBy !== 'system' ? ` by ${d.createdBy}` : ''}</div>
                  <div className="when">{new Date(d.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</div>
                </li>
              ))}
              {order.returns.map((r) => (
                <li key={r.id}>
                  <div>Return {r.status.toLowerCase()} ({r.items.length} line(s))</div>
                  <div className="when">{new Date(r.decidedAt ?? r.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {offlineOpen && <OfflinePaymentModal open onClose={() => setOfflineOpen(false)} order={order} onDone={(m) => { setOfflineOpen(false); setMessage(m); }} />}
      {shipOpen && <ShipmentModal open onClose={() => setShipOpen(false)} order={order} onDone={(m) => { setShipOpen(false); setMessage(m); }} />}
      <DocumentPreview docId={docPreview} onClose={() => setDocPreview(null)} />
      <p className="xsmall muted mt-4">Acting as {staff?.name} ({staff?.role}) — all actions are permission-checked and audited server-side.</p>
    </div>
  );
}

function OfflinePaymentModal({ open, onClose, order, onDone }: { open: boolean; onClose: () => void; order: Order; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!reference.trim()) return setError('A payment reference is required (recorded against the payment).');
    setBusy(true);
    try {
      await api.admin.offlinePayment(order.id, reference.trim());
      qc.invalidateQueries();
      onDone(`Offline payment ${reference} recorded — stock committed atomically (§7.4).`);
    } catch (e) {
      setError((e as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Record offline payment — ${order.number}`} small>
      <p className="small muted">Validates availability and commits stock atomically; records the reference and your identity. Requires ADMIN or FINANCE.</p>
      <Field label="Payment reference" htmlFor="off-ref" error={error ?? undefined} hint="e.g. Bank transfer #88123">
        <input id="off-ref" className="input" value={reference} onChange={(e) => { setReference(e.target.value); setError(null); }} />
      </Field>
      <p className="small">Amount: <strong>{formatAud(order.totalCents)}</strong></p>
      <Button block loading={busy} onClick={save}>Record payment (simulated capture)</Button>
    </Modal>
  );
}

function ShipmentModal({ open, onClose, order, onDone }: { open: boolean; onClose: () => void; order: Order; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const shippable = order.lines.filter((l) => Math.min(l.pickedQty, l.quantity) - l.shippedQty > 0);
  const [carrier, setCarrier] = useState('SpeedEx (demo)');
  const [service, setService] = useState('Road');
  const [tracking, setTracking] = useState(`SPX${Date.now().toString().slice(-6)}AU`);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(shippable.map((l) => [l.id, Math.min(l.pickedQty, l.quantity) - l.shippedQty])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const items = Object.entries(qty).filter(([, n]) => n > 0).map(([lineId, quantity]) => ({ lineId, quantity }));
    if (!carrier.trim() || !tracking.trim()) return setError('Carrier and tracking number are required.');
    if (items.length === 0) return setError('Add at least one line quantity.');
    setBusy(true);
    try {
      await api.admin.createShipment(order.id, { carrier, service, trackingNumber: tracking, items });
      qc.invalidateQueries();
      onDone(`Shipment ${tracking} created. Dispatch it to reduce stock.`);
    } catch (e) {
      setError((e as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`New shipment — ${order.number}`}>
      {shippable.length === 0 && <p className="small muted">Nothing picked and unshipped. Confirm picking first.</p>}
      {shippable.map((l) => {
        const remaining = Math.min(l.pickedQty, l.quantity) - l.shippedQty;
        return (
          <div className="row-between small" key={l.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{l.skuCode} — {remaining} ready</span>
            <input
              className="input input-sm" style={{ width: 90 }} type="number" min={0} max={remaining}
              value={qty[l.id] ?? 0} aria-label={`Quantity for ${l.skuCode}`}
              onChange={(e) => setQty({ ...qty, [l.id]: Math.min(Number(e.target.value), remaining) })}
            />
          </div>
        );
      })}
      <div className="row mt-3 wrap">
        <Field label="Carrier" htmlFor="shp-carrier"><input id="shp-carrier" className="input input-sm" value={carrier} onChange={(e) => setCarrier(e.target.value)} /></Field>
        <Field label="Service" htmlFor="shp-service"><input id="shp-service" className="input input-sm" value={service} onChange={(e) => setService(e.target.value)} /></Field>
        <Field label="Tracking number" htmlFor="shp-track"><input id="shp-track" className="input input-sm" value={tracking} onChange={(e) => setTracking(e.target.value)} /></Field>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <Button block loading={busy} onClick={save}>Create shipment</Button>
      <p className="xsmall muted mt-2 mb-0">Dispatch reduces allocated + on-hand exactly once; duplicate dispatch calls are no-ops.</p>
    </Modal>
  );
}

export { Field };

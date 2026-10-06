import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, ErrorState, Field, Loading, Modal, StatusBadge } from '@aus/ui';
import type { Order } from '@aus/contracts';

export default function Fulfilment({ focus }: { focus?: boolean }) {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useQuery<Order[], ApiClientError>({
    queryKey: ['fulfilment-queue'],
    queryFn: () => api.admin.fulfilmentQueue() as unknown as Promise<Order[]>,
    refetchInterval: 15_000,
  });
  const [selected, setSelected] = useState<string | null>(id ?? null);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  const orders = data ?? [];
  const openOrder = focus && id ? orders.find((o) => o.id === id) : orders.find((o) => o.id === selected) ?? null;

  return (
    <div>
      <div className="page-head">
        <h1>Fulfilment</h1>
        <span className="small muted">Ready-to-pick → picking → packed → dispatched</span>
      </div>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: openOrder ? 'minmax(280px, 380px) 1fr' : '1fr', gap: 16 }}>
        <div>
          <QueueTable
            orders={orders}
            selected={selected}
            onSelect={(oid) => setSelected(oid)}
          />
        </div>
        {openOrder && (
          <div className="card card-pad">
            <WorkPanel order={openOrder} />
          </div>
        )}
      </div>
    </div>
  );
}

function QueueTable({ orders, selected, onSelect }: { orders: Order[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Order</th><th>State</th><th>Lines</th></tr></thead>
        <tbody>
          {orders.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 24 }}>Queue is empty. 🎉</td></tr>}
          {orders.map((o) => (
            <tr key={o.id} onClick={() => onSelect(o.id)} style={{ cursor: 'pointer', background: selected === o.id ? 'var(--brand-50)' : undefined }}>
              <td><strong>{o.number}</strong><div className="xsmall muted">{o.contact.name}</div></td>
              <td><StatusBadge status={o.fulfilmentStatus} /></td>
              <td className="small muted">{o.lines.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkPanel({ order }: { order: Order }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, number>>(() => Object.fromEntries(order.lines.map((l) => [l.id, l.pickedQty])));

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => { await fn(); },
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['fulfilment-queue'] }); },
    onError: (e) => setError((e as ApiClientError).message),
  });

  const shippable = order.lines.filter((l) => Math.min(l.pickedQty, l.quantity) - l.shippedQty > 0);

  return (
    <div>
      <div className="row-between wrap">
        <h2 className="mb-0">{order.number} <StatusBadge status={order.fulfilmentStatus} /></h2>
        <Link className="small" to={`/orders/${order.id}`}>Full order →</Link>
      </div>
      {error && <div className="card card-pad mt-3" role="alert" style={{ borderColor: 'var(--danger-600)' }}>{error}</div>}

      <div className="row wrap mt-3">
        {order.fulfilmentStatus === 'READY_TO_PICK' && (
          <Button loading={act.isPending} onClick={() => act.mutate(() => api.admin.startPicking(order.id))}>Start picking</Button>
        )}
        {order.fulfilmentStatus === 'PICKING' && (
          <Button loading={act.isPending} disabled={order.lines.some((l) => l.exception === 'SHORT_PICKED')} onClick={() => act.mutate(() => api.admin.pack(order.id))}>Confirm packed</Button>
        )}
        {['PICKED', 'PICKING'].includes(order.fulfilmentStatus) && !order.lines.some((l) => l.exception === 'SHORT_PICKED') && (
          <Button variant="secondary" loading={act.isPending} onClick={() => act.mutate(() => api.admin.pack(order.id))}>Mark packed</Button>
        )}
        {shippable.length > 0 && (
          <Button variant="secondary" onClick={() => setShipOpen(true)}>Create shipment ({shippable.reduce((n, l) => n + Math.min(l.pickedQty, l.quantity) - l.shippedQty, 0)} units ready)</Button>
        )}
      </div>

      <table className="tbl mt-4">
        <thead>
          <tr><th>Line</th><th className="num">Ordered</th><th className="num">Picked</th><th className="num">Shipped</th><th>Confirm pick</th></tr>
        </thead>
        <tbody>
          {order.lines.map((l) => {
            const canPick = order.fulfilmentStatus === 'PICKING' && l.exception !== 'CANCELLED';
            const remaining = l.quantity - l.shippedQty;
            return (
              <tr key={l.id}>
                <td>
                  <strong>{l.skuCode}</strong> <span className="muted small">{l.productName}</span>
                  {l.exception === 'SHORT_PICKED' && <Badge tone="warn"> short-picked</Badge>}
                  {l.exception === 'CANCELLED' && <Badge tone="danger"> cancelled</Badge>}
                </td>
                <td className="num">{l.quantity}</td>
                <td className="num">{l.pickedQty}</td>
                <td className="num">{l.shippedQty}{remaining > 0 && l.shippedQty < l.quantity ? ` (${remaining} to go)` : ''}</td>
                <td>
                  {canPick ? (
                    <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <input
                        className="input input-sm" style={{ width: 70 }} type="number" min={0} max={l.quantity}
                        value={picked[l.id] ?? l.pickedQty}
                        aria-label={`Picked quantity for ${l.skuCode}`}
                        onChange={(e) => setPicked({ ...picked, [l.id]: Math.min(Number(e.target.value), l.quantity) })}
                      />
                      <Button
                        size="sm"
                        loading={act.isPending}
                        onClick={() => act.mutate(() => api.admin.pick(order.id, l.id, picked[l.id] ?? l.pickedQty))}
                      >
                        Save
                      </Button>
                    </span>
                  ) : <span className="xsmall muted">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {order.lines.some((l) => l.exception === 'SHORT_PICKED') && (
        <div className="card card-pad mt-4" style={{ borderColor: 'var(--warn-700)', background: 'var(--warn-100)' }}>
          <h3 className="mb-2">Open pick exceptions</h3>
          {order.lines.filter((l) => l.exception === 'SHORT_PICKED').map((l) => (
            <div className="row-between wrap small" key={l.id} style={{ padding: '4px 0' }}>
              <span><strong>{l.skuCode}</strong> — picked {l.pickedQty} of {l.quantity}. Staff cannot dispatch unavailable quantities.</span>
              <span className="row">
                <Button size="sm" variant="secondary" loading={act.isPending} onClick={() => act.mutate(() => api.admin.resolveException(order.id, l.id, 'mark-picked'))}>Stock found — pick all</Button>
                <Button size="sm" variant="ghost" loading={act.isPending} onClick={() => act.mutate(() => api.admin.resolveException(order.id, l.id, 'cancel-remaining'))}>Cancel remaining</Button>
              </span>
            </div>
          ))}
        </div>
      )}

      {shipOpen && <ShipmentModal open onClose={() => setShipOpen(false)} order={order} />}
    </div>
  );
}

function ShipmentModal({ open, onClose, order }: { open: boolean; onClose: () => void; order: Order }) {
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
    if (items.length === 0) return setError('Add at least one line.');
    setBusy(true);
    try {
      await api.admin.createShipment(order.id, { carrier, service, trackingNumber: tracking, items });
      qc.invalidateQueries({ queryKey: ['fulfilment-queue'] });
      onClose();
    } catch (e) {
      setError((e as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`New shipment — ${order.number}`}>
      {shippable.map((l) => {
        const remaining = Math.min(l.pickedQty, l.quantity) - l.shippedQty;
        return (
          <div className="row-between small" key={l.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{l.skuCode} — {remaining} ready</span>
            <input className="input input-sm" style={{ width: 80 }} type="number" min={0} max={remaining} value={qty[l.id] ?? 0} aria-label={`Quantity for ${l.skuCode}`} onChange={(e) => setQty({ ...qty, [l.id]: Math.min(Number(e.target.value), remaining) })} />
          </div>
        );
      })}
      <div className="row mt-3 wrap">
        <Field label="Carrier" htmlFor="f-carrier"><input id="f-carrier" className="input input-sm" value={carrier} onChange={(e) => setCarrier(e.target.value)} /></Field>
        <Field label="Service" htmlFor="f-service"><input id="f-service" className="input input-sm" value={service} onChange={(e) => setService(e.target.value)} /></Field>
        <Field label="Tracking" htmlFor="f-track"><input id="f-track" className="input input-sm" value={tracking} onChange={(e) => setTracking(e.target.value)} /></Field>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <Button block loading={busy} onClick={save}>Create shipment</Button>
      <p className="xsmall muted mt-2 mb-0">Dispatch from the order page reduces allocated + on-hand exactly once.</p>
    </Modal>
  );
}

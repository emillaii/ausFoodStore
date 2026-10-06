import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { DataTable, Money } from '../components/DataTable';
import { Badge, Button, ErrorState, Field, Loading, Modal, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { Address, Customer, LoyaltyEntry, Order, StaffNote } from '@aus/contracts';

interface CustomerRow extends Customer {
  orderCount: number;
  loyalty: { available: number; pending: number; held: number };
}

export default function Customers() {
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch } = useQuery<{ items: CustomerRow[]; total: number }, ApiClientError>({
    queryKey: ['admin-customers', q],
    queryFn: () => api.admin.customers(q),
  });
  const [detailId, setDetailId] = useState<string | null>(null);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <div className="page-head"><h1>Customers</h1></div>
      <DataTable
        rows={data?.items ?? []}
        rowKey={(c: CustomerRow) => c.id}
        search={q} onSearch={setQ} searchPlaceholder="Search name or email…"
        columns={[
          { key: 'name', header: 'Customer', sortValue: (c) => `${c.firstName} ${c.lastName}`, render: (c) => (
            <span><strong>{c.firstName} {c.lastName}</strong><div className="xsmall muted">{c.email}</div></span>
          ) },
          { key: 'member', header: 'Member', render: (c) => c.member ? <Badge tone="loyalty">Member</Badge> : <span className="muted small">Standard</span> },
          { key: 'state', header: 'State', render: (c) => <StatusBadge status={c.state === 'ACTIVE' ? 'ACTIVE' : c.state === 'SUSPENDED' ? 'SUSPENDED' : 'PENDING'} /> },
          { key: 'orders', header: 'Orders', numeric: true, sortValue: (c) => c.orderCount, render: (c) => c.orderCount },
          { key: 'coins', header: 'Coins (avail/pending)', numeric: true, sortValue: (c) => c.loyalty.available, render: (c) => (
            <span className="coins-chip">🪙 {c.loyalty.available} <span className="muted">/ {c.loyalty.pending} pend</span></span>
          ) },
          { key: 'actions', header: '', render: (c) => <Button size="sm" variant="secondary" onClick={() => setDetailId(c.id)}>Open</Button> },
        ]}
        empty="No customers match."
      />
      {detailId && <CustomerDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-customer', id],
    queryFn: () => api.admin.customer(id),
  });
  const [note, setNote] = useState('');
  const [coinAmount, setCoinAmount] = useState('');
  const [coinReason, setCoinReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const addNote = useMutation({
    mutationFn: () => api.admin.addCustomerNote(id, note),
    onSuccess: () => { setNote(''); qc.invalidateQueries({ queryKey: ['admin-customer', id] }); },
    onError: (e) => setErr((e as ApiClientError).message),
  });

  const adjustCoins = useMutation({
    mutationFn: () => api.admin.adjustCoins(id, Number(coinAmount), coinReason),
    onSuccess: () => {
      setMsg(`Coins adjusted. New available balance updated.`);
      setCoinAmount(''); setCoinReason('');
      qc.invalidateQueries({ queryKey: ['admin-customer', id] });
    },
    onError: (e) => setErr((e as ApiClientError).message),
  });

  if (isLoading) return <Modal open onClose={onClose} title="Customer"><Loading /></Modal>;
  if (error || !data) return <Modal open onClose={onClose} title="Customer"><ErrorState error={error} onRetry={() => refetch()} /></Modal>;

  const c = data as Customer & { addresses: Address[]; orders: Order[]; loyalty: { available: number; pending: number; held: number }; loyaltyTransactions: LoyaltyEntry[]; notes: StaffNote[] };

  return (
    <Modal open onClose={onClose} title={`${c.firstName} ${c.lastName}`}>
      {err && <p className="field-error" role="alert">{err}</p>}
      {msg && <p className="small" role="status" style={{ color: 'var(--success-700)' }}>{msg}</p>}
      <div className="small muted">{c.email} · {c.phone ?? 'no phone'} · joined {new Date(c.createdAt).toLocaleDateString('en-AU')} {c.member && <Badge tone="loyalty">Member</Badge>} <StatusBadge status={c.state === 'ACTIVE' ? 'ACTIVE' : c.state} /></div>

      <h3 className="mt-4">Loyalty</h3>
      <div className="row small">
        <span className="coins-chip">🪙 {c.loyalty.available} available</span>
        <span className="muted">· {c.loyalty.pending} pending · {c.loyalty.held} held</span>
      </div>
      <div className="row mt-2 wrap" style={{ alignItems: 'flex-end' }}>
        <Field label="Adjust coins (±)" htmlFor="cd-coins"><input id="cd-coins" className="input input-sm" style={{ width: 90 }} value={coinAmount} onChange={(e) => setCoinAmount(e.target.value.replace(/[^\d-]/g, ''))} /></Field>
        <Field label="Reason (required)" htmlFor="cd-reason"><input id="cd-reason" className="input input-sm" style={{ width: 220 }} value={coinReason} onChange={(e) => setCoinReason(e.target.value)} /></Field>
        <Button size="sm" disabled={!coinAmount || Number(coinAmount) === 0 || !coinReason.trim()} loading={adjustCoins.isPending} onClick={() => adjustCoins.mutate()}>Apply</Button>
      </div>

      <h3 className="mt-4">Orders ({c.orders.length})</h3>
      <div className="stack small">
        {c.orders.map((o) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="row-between" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            <span><strong>{o.number}</strong> <StatusBadge status={o.fulfilmentStatus} /></span>
            <span><Money cents={o.totalCents} /></span>
          </Link>
        ))}
        {c.orders.length === 0 && <p className="muted mb-0">No orders.</p>}
      </div>

      <h3 className="mt-4">Addresses</h3>
      {c.addresses.map((a) => (
        <p className="small mb-2" key={a.id}>
          {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.suburb} {a.state} {a.postcode} {a.isDefaultShipping && <Badge tone="info">default</Badge>}
        </p>
      ))}
      {c.addresses.length === 0 && <p className="small muted">None saved.</p>}

      <h3 className="mt-4">Loyalty ledger (recent)</h3>
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {c.loyaltyTransactions.slice(0, 12).map((t) => (
          <div className="row-between xsmall" key={t.id} style={{ padding: '3px 0' }}>
            <span className="muted">{t.type.replaceAll('_', ' ').toLowerCase()} · {t.reference}</span>
            <span style={{ fontWeight: 700 }}>{t.deltaAvailable !== 0 ? `${t.deltaAvailable > 0 ? '+' : ''}${t.deltaAvailable}` : t.deltaPending !== 0 ? `${t.deltaPending > 0 ? '+' : ''}${t.deltaPending} pend` : 'commit'}</span>
          </div>
        ))}
      </div>

      <h3 className="mt-4">Authorised notes (staff only)</h3>
      <div className="row">
        <input className="input input-sm grow" placeholder="Add a private note…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Customer note" />
        <Button size="sm" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>Add</Button>
      </div>
      {c.notes.map((n) => (
        <div className="small mt-2" key={n.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
          <strong>{n.authorName}</strong> <span className="xsmall muted">{new Date(n.createdAt).toLocaleDateString('en-AU')}</span>
          <div>{n.body}</div>
        </div>
      ))}
      <p className="xsmall muted mt-3 mb-0">Sample rule reference: 100 coins = $1 discount. Adjustments require a reason and are audited.</p>
    </Modal>
  );
}

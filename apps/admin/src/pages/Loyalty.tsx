import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import { Button, ErrorState, Field, Loading, Modal } from '@aus/ui';
import type { Customer } from '@aus/contracts';

interface Row extends Customer { orderCount: number; loyalty: { available: number; pending: number; held: number } }

export default function Loyalty() {
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch } = useQuery<{ items: Row[] }, ApiClientError>({
    queryKey: ['admin-customers', q],
    queryFn: () => api.admin.customers(q),
  });
  const [adjusting, setAdjusting] = useState<Row | null>(null);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <div className="page-head">
        <h1>Loyalty</h1>
        <span className="small muted">Sample policy: 1 coin per AUD 1 · 100 coins = $1 · pending until full shipment</span>
      </div>
      <DataTable
        rows={data?.items ?? []}
        rowKey={(c: Row) => c.id}
        search={q} onSearch={setQ} searchPlaceholder="Search customer…"
        columns={[
          { key: 'name', header: 'Customer', sortValue: (c) => `${c.firstName} ${c.lastName}`, render: (c) => `${c.firstName} ${c.lastName}` },
          { key: 'email', header: 'Email', render: (c) => <span className="small muted">{c.email}</span> },
          { key: 'avail', header: 'Available', numeric: true, sortValue: (c) => c.loyalty.available, render: (c) => <strong>{c.loyalty.available}</strong> },
          { key: 'pend', header: 'Pending', numeric: true, sortValue: (c) => c.loyalty.pending, render: (c) => c.loyalty.pending },
          { key: 'held', header: 'Held', numeric: true, render: (c) => c.loyalty.held },
          { key: 'actions', header: '', render: (c) => <Button size="sm" variant="secondary" onClick={() => setAdjusting(c)}>Adjust</Button> },
        ]}
        empty="No customers."
      />
      <AdjustModal row={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}

function AdjustModal({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [coins, setCoins] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const amount = Number(coins);
    if (!amount || amount === 0) return setError('Enter a non-zero signed amount.');
    if (!reason.trim()) return setError('A reason is required and audited.');
    setBusy(true);
    try {
      await api.admin.adjustCoins(row!.id, amount, reason.trim());
      qc.invalidateQueries({ queryKey: ['admin-customers'] });
      onClose();
    } catch (e) {
      setError((e as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!row} onClose={onClose} title={`Adjust coins — ${row ? `${row.firstName} ${row.lastName}` : ''}`} small>
      <p className="small muted">Available: <strong>{row?.loyalty.available ?? 0}</strong> · pending {row?.loyalty.pending ?? 0} · held {row?.loyalty.held ?? 0}</p>
      <Field label="Signed coin adjustment" htmlFor="ly-coins" hint="e.g. 50 or -20" error={error ?? undefined}>
        <input id="ly-coins" className="input" value={coins} onChange={(e) => setCoins(e.target.value.replace(/[^\d-]/g, ''))} />
      </Field>
      <Field label="Reason (recorded in audit)" htmlFor="ly-reason">
        <input id="ly-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Goodwill gesture" />
      </Field>
      <Button block loading={busy} onClick={save}>Apply adjustment</Button>
    </Modal>
  );
}

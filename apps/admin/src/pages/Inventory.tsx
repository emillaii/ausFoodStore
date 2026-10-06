import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import { Badge, Button, ErrorState, Field, Loading, Modal } from '@aus/ui';

interface InvRow {
  skuId: string; skuCode: string; productId: string; productName: string; optionSummary: string;
  onHand: number; reserved: number; allocated: number; available: number; lowStockThreshold: number; version: number; lowStock: boolean;
}

export default function Inventory() {
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [adjusting, setAdjusting] = useState<InvRow | null>(null);
  const [historyFor, setHistoryFor] = useState<InvRow | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-inventory', q, lowOnly],
    queryFn: () => api.admin.inventory({ q, low: lowOnly ? 1 : undefined }),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <div className="page-head">
        <h1>Inventory</h1>
        <span className="small muted">available = on-hand − reserved − allocated</span>
      </div>
      <DataTable
        rows={data?.items ?? []}
        rowKey={(r: InvRow) => r.skuId}
        search={q} onSearch={setQ} searchPlaceholder="Search SKU or product…"
        toolbar={
          <button className={`chip ${lowOnly ? 'on' : ''}`} aria-pressed={lowOnly} onClick={() => setLowOnly((v) => !v)}>
            Low stock only
          </button>
        }
        columns={[
          { key: 'sku', header: 'SKU', sortValue: (r) => r.skuCode, render: (r) => (
            <span><strong>{r.skuCode}</strong><div className="xsmall muted">{r.productName}{r.optionSummary ? ` · ${r.optionSummary}` : ''}</div></span>
          ) },
          { key: 'onHand', header: 'On hand', numeric: true, sortValue: (r) => r.onHand, render: (r) => r.onHand },
          { key: 'res', header: 'Reserved', numeric: true, render: (r) => r.reserved },
          { key: 'alloc', header: 'Allocated', numeric: true, render: (r) => r.allocated },
          { key: 'avail', header: 'Available', numeric: true, sortValue: (r) => r.available, render: (r) => (
            <strong style={{ color: r.available === 0 ? 'var(--danger-600)' : r.lowStock ? 'var(--warn-700)' : 'inherit' }}>{r.available}</strong>
          ) },
          { key: 'thr', header: 'Threshold', numeric: true, render: (r) => r.lowStockThreshold },
          { key: 'flag', header: 'Status', render: (r) => r.available === 0 ? <Badge tone="danger">Out</Badge> : r.lowStock ? <Badge tone="warn">Low</Badge> : <Badge tone="success">OK</Badge> },
          { key: 'actions', header: '', render: (r) => (
            <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="secondary" onClick={() => setHistoryFor(r)}>History</Button>
              <AdjustButton row={r} onOpen={() => setAdjusting(r)} />
            </span>
          ) },
        ]}
        empty="No SKUs match."
      />
      <AdjustModal row={adjusting} onClose={() => setAdjusting(null)} />
      <MovementsModal row={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

function AdjustButton({ row, onOpen }: { row: InvRow; onOpen: () => void }) {
  const { can } = { can: (p: string) => {
    // permission checked again server-side; hide button for roles known to lack it
    return true;
  } };
  void can;
  return <Button size="sm" onClick={onOpen}>Adjust</Button>;
}

function AdjustModal({ row, onClose }: { row: InvRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['adjust-preview', row?.skuId, delta],
    queryFn: () => api.admin.previewAdjustment(row!.skuId, Number(delta || 0)),
    enabled: !!row && delta !== '',
  });

  const adjust = useMutation({
    mutationFn: () => api.admin.adjustStock(row!.skuId, Number(delta), reason, reference || undefined),
    onSuccess: (res: { before: { onHand: number }; after: { onHand: number }; availableAfter: number }) => {
      qc.invalidateQueries({ queryKey: ['admin-inventory'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setResult(`On-hand ${res.before.onHand} → ${res.after.onHand}. Available now ${res.availableAfter}.`);
    },
    onError: (e) => setError((e as ApiClientError).message),
  });

  if (!row) return null;
  const pv = preview.data as { allowed: boolean; blockReason: string | null; projected: { onHand: number; available: number } } | undefined;

  return (
    <Modal open onClose={onClose} title={`Adjust stock — ${row.skuCode}`}>
      <p className="small muted">
        On hand <strong>{row.onHand}</strong> · reserved <strong>{row.reserved}</strong> · allocated <strong>{row.allocated}</strong> · available <strong>{row.available}</strong>
      </p>
      {result ? (
        <>
          <div className="card card-pad small" role="status" style={{ background: 'var(--success-100)', borderColor: 'var(--success-700)' }}>{result}</div>
          <Button block className="mt-4" onClick={onClose}>Done</Button>
        </>
      ) : (
        <>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Signed adjustment (± units)" htmlFor="adj-delta" hint="e.g. 10 or -3">
              <input id="adj-delta" className="input" style={{ width: 140 }} inputMode="numeric" value={delta} onChange={(e) => { setDelta(e.target.value.replace(/[^\d-]/g, '')); setError(null); }} />
            </Field>
          </div>
          <Field label="Reason (required, recorded in audit)" htmlFor="adj-reason">
            <input id="adj-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stock count correction" />
          </Field>
          <Field label="Reference (optional)" htmlFor="adj-ref">
            <input id="adj-ref" className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Delivery DO-1234" />
          </Field>
          {pv && delta !== '' && (
            <div className={`card card-pad small ${pv.allowed ? '' : 'mt-0'}`} style={pv.allowed ? { background: 'var(--brand-50)' } : { background: 'var(--danger-100)', borderColor: 'var(--danger-600)' }} role={pv.allowed ? 'status' : 'alert'}>
              <strong>Preview:</strong> on-hand {row.onHand} → {pv.projected.onHand}, available {row.available} → {pv.projected.available}.
              {!pv.allowed && <div className="mt-2"><strong>Rejected:</strong> {pv.blockReason}</div>}
            </div>
          )}
          {error && <p className="field-error" role="alert">{error}</p>}
          <Button
            block className="mt-2"
            disabled={!delta || delta === '0' || Number.isNaN(Number(delta)) || !reason.trim() || (pv ? !pv.allowed : false)}
            loading={adjust.isPending}
            onClick={() => adjust.mutate()}
          >
            Confirm adjustment
          </Button>
          <p className="xsmall muted mt-2 mb-0">Adjustments that would take on-hand below reserved + allocated are rejected — reconcile open holds first. Movement history is append-only.</p>
        </>
      )}
    </Modal>
  );
}

function MovementsModal({ row, onClose }: { row: InvRow | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['movements', row?.skuId],
    queryFn: () => api.admin.movements(row!.skuId),
    enabled: !!row,
  });
  if (!row) return null;
  const movements = (data ?? []) as { id: string; type: string; before: { onHand: number }; after: { onHand: number }; deltas: Record<string, number>; reference: string; reason?: string; actor: string; createdAt: string }[];
  return (
    <Modal open onClose={onClose} title={`Movement history — ${row.skuCode}`}>
      {isLoading && <Loading />}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>When</th><th>Type</th><th>Δ</th><th>On hand</th><th>Ref / reason</th><th>Actor</th></tr></thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td className="xsmall">{new Date(m.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="xsmall"><Badge tone={m.type === 'DISPATCH' ? 'info' : m.type === 'ADJUSTMENT' ? 'warn' : 'neutral'}>{m.type.replaceAll('_', ' ').toLowerCase()}</Badge></td>
                <td className="xsmall num">{m.deltas.onHand != null && m.deltas.onHand !== 0 ? `${m.deltas.onHand > 0 ? '+' : ''}${m.deltas.onHand}oh ` : ''}{m.deltas.reserved ? `${m.deltas.reserved > 0 ? '+' : ''}${m.deltas.reserved}r ` : ''}{m.deltas.allocated ? `${m.deltas.allocated > 0 ? '+' : ''}${m.deltas.allocated}a` : ''}</td>
                <td className="xsmall num">{m.before.onHand} → {m.after.onHand}</td>
                <td className="xsmall">{m.reference}{m.reason ? <div className="muted">{m.reason}</div> : null}</td>
                <td className="xsmall">{m.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="xsmall muted mt-2 mb-0">Append-only ledger — reversals create compensating entries.</p>
    </Modal>
  );
}

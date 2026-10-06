import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useStaff } from '../lib/staff';
import { Button, ErrorState, Field, Loading, Modal, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { Order, ReturnRequest } from '@aus/contracts';

type ReturnRow = ReturnRequest & { order: Order };

export default function Returns() {
  const [status, setStatus] = useState('');
  const { data, isLoading, error, refetch } = useQuery<{ items: ReturnRow[] }, ApiClientError>({
    queryKey: ['admin-returns', status],
    queryFn: () => api.admin.returns(status || undefined),
    refetchInterval: 20_000,
  });
  const [deciding, setDeciding] = useState<ReturnRow | null>(null);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  const rows = data?.items ?? [];
  const pending = rows.filter((r) => r.status === 'REQUESTED');

  return (
    <div>
      <div className="page-head">
        <h1>Returns &amp; refunds</h1>
        <select className="select input-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Return</th><th>Order</th><th>Customer</th><th>Items</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>No return requests.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="xsmall">{new Date(r.createdAt).toLocaleDateString('en-AU')}</td>
                <td><Link to={`/orders/${r.orderId}`}><strong>{r.orderNumber}</strong></Link></td>
                <td className="small">{r.customerName}</td>
                <td className="small">{r.items.map((i) => `${i.quantity} × ${r.order.lines.find((l) => l.id === i.lineId)?.skuCode ?? '?'}`).join(', ')}</td>
                <td className="small muted">{r.items[0].reason}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.status === 'REQUESTED' && <Button size="sm" onClick={() => setDeciding(r)}>Review</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted mt-2">{pending.length} request(s) awaiting review. Approving a refund requires FINANCE/ADMIN; CUSTOMER_SERVICE can review but not execute refunds.</p>
      {deciding && <DecisionModal ret={deciding} onClose={() => setDeciding(null)} />}
    </div>
  );
}

function DecisionModal({ ret, onClose }: { ret: ReturnRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { staff } = useStaff();
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [disposition, setDisposition] = useState<'RESTOCK' | 'DAMAGED' | 'DESTROY'>('RESTOCK');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Refund preview: sum of returned line values
  const previewCents = ret.items.reduce((sum, item) => {
    const line = ret.order.lines.find((l) => l.id === item.lineId);
    if (!line) return sum;
    return sum + Math.round(line.lineTotalCents / line.quantity) * item.quantity;
  }, 0);

  const submit = async () => {
    if (!decision) return;
    if (!reason.trim()) return setError('A decision reason is required.');
    setBusy(true);
    setError(null);
    try {
      await api.admin.decideReturn(ret.id, { decision, disposition, reason });
      qc.invalidateQueries({ queryKey: ['admin-returns'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    } catch (e) {
      setError((e as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Review return — ${ret.orderNumber}`}>
      <p className="small muted">Requested by {ret.requestedBy} · {new Date(ret.createdAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <table className="tbl">
        <thead><tr><th>Line</th><th className="num">Qty</th><th className="num">Refund value</th></tr></thead>
        <tbody>
          {ret.items.map((i) => {
            const line = ret.order.lines.find((l) => l.id === i.lineId)!;
            return (
              <tr key={i.lineId}>
                <td className="small">{line.skuCode} — {line.productName}</td>
                <td className="num">{i.quantity}</td>
                <td className="num">{formatAud(Math.round(line.lineTotalCents / line.quantity) * i.quantity)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small mt-2">Refund preview (service-calculated): <strong>{formatAud(previewCents)}</strong> — refunding this amount is a separate, permissioned action.</p>

      <div className="row wrap mt-2">
        <Button variant="secondary" onClick={() => setDecision('approve')} aria-pressed={decision === 'approve'}>Approve refund…</Button>
        <Button variant="ghost" onClick={() => setDecision('reject')} aria-pressed={decision === 'reject'}>Reject</Button>
      </div>

      {decision === 'approve' && (
        <>
          <Field label="Stock disposition (explicit — §8.3)" htmlFor="ret-disp" hint="Only RESTOCK returns units to saleable inventory">
            <select id="ret-disp" className="select" value={disposition} onChange={(e) => setDisposition(e.target.value as 'RESTOCK' | 'DAMAGED' | 'DESTROY')}>
              <option value="RESTOCK">RESTOCK — return to saleable stock</option>
              <option value="DAMAGED">DAMAGED — dispose, no stock change</option>
              <option value="DESTROY">DESTROY — dispose, no stock change</option>
            </select>
          </Field>
          <p className="xsmall muted">A credit note is generated and earned coins are reversed proportionally (sample policy).</p>
        </>
      )}
      <Field label="Decision reason" htmlFor="ret-decision" error={error ?? undefined}>
        <textarea id="ret-decision" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button block loading={busy} disabled={!decision} onClick={submit}>
        {decision === 'approve' ? `Approve & refund ${formatAud(previewCents)} (simulated)` : decision === 'reject' ? 'Reject request' : 'Choose approve or reject'}
      </Button>
      <p className="xsmall muted mt-2 mb-0">Acting as {staff?.name} ({staff?.role}). CUSTOMER_SERVICE cannot execute refunds by default — the API enforces this.</p>
    </Modal>
  );
}

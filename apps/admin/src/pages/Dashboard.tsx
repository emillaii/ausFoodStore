import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { DataTable, Money, RangePicker } from '../components/DataTable';
import { Badge, ErrorState, Loading } from '@aus/ui';

interface DashboardData {
  range: { from: string; to: string };
  salesDefinition: string;
  salesTotalCents: number;
  paidOrders: number;
  awaitingPick: { id: string; number: string; contact: string; placedAt: string }[];
  pendingRefunds: { orderNumber: string; returnId: string; items: number; createdAt: string }[];
  lowStock: { skuCode: string; productName: string; available: number; threshold: number }[];
}

export default function Dashboard() {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading, error, refetch } = useQuery<DashboardData, ApiClientError>({
    queryKey: ['dashboard', range],
    queryFn: () => api.admin.dashboard(range),
    refetchInterval: 20_000,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
        <RangePicker from={range.from} to={range.to} onChange={setRange} />
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <div className="label">Sales (paid orders in range)</div>
          <div className="value"><Money cents={data.salesTotalCents} /></div>
          <div className="hint" title={data.salesDefinition}>definition ⓘ</div>
        </div>
        <div className="card stat">
          <div className="label">Paid orders</div>
          <div className="value">{data.paidOrders}</div>
          <div className="hint">in selected range</div>
        </div>
        <div className="card stat">
          <div className="label">Awaiting picking</div>
          <div className="value">{data.awaitingPick.length}</div>
          <div className="hint">paid, ready to pick</div>
        </div>
        <div className="card stat">
          <div className="label">Pending refunds</div>
          <div className="value">{data.pendingRefunds.length}</div>
          <div className="hint">return requests to review</div>
        </div>
      </div>

      <div className="mt-6 grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <div className="card card-pad">
          <div className="row-between">
            <h3 className="mb-0">Queue — ready to pick</h3>
            <Link className="small" to="/fulfilment">Open fulfilment →</Link>
          </div>
          <div className="stack mt-2">
            {data.awaitingPick.length === 0 && <p className="muted small mb-0">Nothing waiting. 🎉</p>}
            {data.awaitingPick.slice(0, 6).map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="row-between small" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span><strong>{o.number}</strong> · {o.contact}</span>
                <span className="muted">{new Date(o.placedAt).toLocaleDateString('en-AU')}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="row-between">
            <h3 className="mb-0">Returns to review</h3>
            <Link className="small" to="/returns">Open queue →</Link>
          </div>
          <div className="stack mt-2">
            {data.pendingRefunds.length === 0 && <p className="muted small mb-0">No pending return requests.</p>}
            {data.pendingRefunds.slice(0, 6).map((r) => (
              <div key={r.returnId} className="row-between small">
                <span><strong>{r.orderNumber}</strong> · {r.items} item(s)</span>
                <Link to={`/orders/${r.orderNumber}`}>Review</Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad mt-4">
        <div className="row-between">
          <h3 className="mb-0">Low stock</h3>
          <Link className="small" to="/inventory">Open inventory →</Link>
        </div>
        <div className="mt-2">
          <DataTable
            rows={data.lowStock}
            rowKey={(r) => r.skuCode}
            columns={[
              { key: 'sku', header: 'SKU', render: (r) => r.skuCode },
              { key: 'name', header: 'Product', render: (r) => r.productName },
              { key: 'avail', header: 'Available', numeric: true, render: (r) => (
                <span style={{ fontWeight: 700, color: r.available === 0 ? 'var(--danger-600)' : 'var(--warn-700)' }}>
                  {r.available}{r.available === 0 ? ' — out' : ''}
                </span>
              ) },
              { key: 'thr', header: 'Threshold', numeric: true, render: (r) => r.threshold },
              { key: 'badge', header: 'Status', render: (r) => r.available === 0 ? <Badge tone="danger">Out of stock</Badge> : <Badge tone="warn">Low</Badge> },
            ]}
            empty="No low-stock SKUs."
          />
        </div>
      </div>
    </div>
  );
}

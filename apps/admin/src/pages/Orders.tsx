import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { DataTable, Money } from '../components/DataTable';
import { Button, ErrorState, Loading, StatusBadge } from '@aus/ui';
import type { Order } from '@aus/contracts';

const PAYMENT_STATES = ['UNPAID', 'PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];
const FULFILMENT_STATES = ['DRAFT', 'INVOICE_ISSUED', 'READY_TO_PICK', 'PICKING', 'PICKED', 'PACKED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

export default function Orders() {
  const [q, setQ] = useState('');
  const [payment, setPayment] = useState('');
  const [fulfilment, setFulfilment] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-orders', q, payment, fulfilment],
    queryFn: () => api.admin.orders({ q, payment, fulfilment, pageSize: 50 }),
    refetchInterval: 20_000,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <div className="page-head">
        <h1>Orders</h1>
        <Link className="btn btn-primary" to="/orders/new" style={{ display: 'inline-flex' }}>+ New order</Link>
      </div>
      <DataTable
        rows={(data?.items ?? []) as Order[]}
        rowKey={(o) => o.id}
        search={q} onSearch={setQ} searchPlaceholder="Search order #, customer, email, SKU…"
        toolbar={
          <>
            <select className="select input-sm" value={payment} onChange={(e) => setPayment(e.target.value)} aria-label="Filter payment status">
              <option value="">All payment states</option>
              {PAYMENT_STATES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
            </select>
            <select className="select input-sm" value={fulfilment} onChange={(e) => setFulfilment(e.target.value)} aria-label="Filter fulfilment status">
              <option value="">All fulfilment states</option>
              {FULFILMENT_STATES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
            </select>
          </>
        }
        columns={[
          { key: 'number', header: 'Order', sortValue: (o) => o.number, render: (o) => <Link to={`/orders/${o.id}`}><strong>{o.number}</strong></Link> },
          { key: 'customer', header: 'Customer', render: (o) => (
            <span>{o.contact.name}<div className="xsmall muted">{o.contact.email}{o.createdBy ? ` · by ${o.createdBy}` : ''}</div></span>
          ) },
          { key: 'placed', header: 'Placed', sortValue: (o) => o.placedAt, render: (o) => new Date(o.placedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) },
          { key: 'pay', header: 'Payment', sortValue: (o) => o.paymentStatus, render: (o) => <StatusBadge status={o.paymentStatus} /> },
          { key: 'ful', header: 'Fulfilment', sortValue: (o) => o.fulfilmentStatus, render: (o) => <StatusBadge status={o.fulfilmentStatus} /> },
          { key: 'total', header: 'Total', numeric: true, sortValue: (o) => o.totalCents, render: (o) => <Money cents={o.totalCents} /> },
        ]}
        empty="No orders match the filters."
        footer={<div className="small muted" style={{ padding: 10 }}>{data?.total ?? 0} orders (most recent first)</div>}
      />
    </div>
  );
}

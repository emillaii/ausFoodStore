import { useQuery } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { EmptyState, ErrorState, Loading, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { Order } from '@aus/contracts';

export default function AccountOrders() {
  const { data, isLoading, error, refetch } = useQuery<Order[], ApiClientError>({ queryKey: ['orders'], queryFn: () => api.myOrders() });
  if (isLoading) return <Loading label="Loading orders…" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <h1>Order history</h1>
      {data?.length === 0 && (
        <EmptyState icon="📦" title="No orders yet" action={<Link className="btn btn-primary" style={{ display: 'inline-flex' }} to="/">Start shopping</Link>} />
      )}
      <div className="stack">
        {data?.map((o) => (
          <Link key={o.id} to={`/account/orders/${o.id}`} className="card card-pad row-between wrap" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div>
              <strong>{o.number}</strong>
              <div className="small muted">
                {new Date(o.placedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · {o.lines.length} lines
              </div>
            </div>
            <div className="row wrap">
              <StatusBadge status={o.paymentStatus} />
              <StatusBadge status={o.fulfilmentStatus} />
              <strong>{formatAud(o.totalCents)}</strong>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

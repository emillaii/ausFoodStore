import { useQuery } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, EmptyState, ErrorState, Loading, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { Order } from '@aus/contracts';

export default function Account() {
  const { customer, signOut } = useAuth();
  const loyalty = useQuery({ queryKey: ['loyalty'], queryFn: () => api.loyalty(), enabled: !!customer });
  const orders = useQuery<Order[], ApiClientError>({ queryKey: ['orders'], queryFn: () => api.myOrders(), enabled: !!customer });

  if (!customer) {
    return (
      <EmptyState
        icon="👤" title="Sign in to view your account"
        body="Demo accounts: ava@example.com / demo1234 (member), liam@example.com / demo1234."
        action={<Link className="btn btn-primary" style={{ display: 'inline-flex' }} to="/login">Sign in</Link>}
      />
    );
  }

  return (
    <div>
      <div className="row-between wrap">
        <div>
          <h1 className="mb-0">Hi, {customer.firstName} 👋</h1>
          <p className="muted small mb-0">{customer.email} {customer.member && <Badge tone="loyalty">Member</Badge>}</p>
        </div>
        <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
      </div>

      <div className="account-grid mt-6">
        <Link className="card acct-tile" to="/account/orders">
          <div className="ico" aria-hidden="true">📦</div>
          <strong>Orders</strong>
          <div className="small muted">{orders.data?.length ?? 0} placed</div>
        </Link>
        <Link className="card acct-tile" to="/account/loyalty">
          <div className="ico" aria-hidden="true">🪙</div>
          <strong>Coins</strong>
          <div className="small muted">{loyalty.data?.balance.available ?? 0} available · {loyalty.data?.balance.pending ?? 0} pending</div>
        </Link>
        <Link className="card acct-tile" to="/account/addresses">
          <div className="ico" aria-hidden="true">📍</div>
          <strong>Addresses</strong>
          <div className="small muted">Manage delivery details</div>
        </Link>
        <Link className="card acct-tile" to="/account/settings">
          <div className="ico" aria-hidden="true">⚙️</div>
          <strong>Settings</strong>
          <div className="small muted">Profile &amp; consent</div>
        </Link>
      </div>

      <section className="section-title"><h2>Recent orders</h2><Link className="small" to="/account/orders">All orders</Link></section>
      {orders.isLoading && <Loading />}
      {orders.error && <ErrorState error={orders.error} onRetry={() => orders.refetch()} />}
      {orders.data && orders.data.length === 0 && <EmptyState icon="📦" title="No orders yet" body="Your first order will appear here." action={<Link to="/" className="btn btn-primary" style={{ display: 'inline-flex' }}>Start shopping</Link>} />}
      {orders.data?.slice(0, 3).map((o) => (
        <Link key={o.id} to={`/account/orders/${o.id}`} className="card card-pad row-between wrap mt-2" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div>
            <strong>{o.number}</strong>
            <div className="small muted">Placed {new Date(o.placedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · {o.lines.length} item{o.lines.length === 1 ? '' : 's'}</div>
          </div>
          <div className="row">
            <StatusBadge status={o.paymentStatus} />
            <StatusBadge status={o.fulfilmentStatus} />
            <span className="price">{formatAud(o.totalCents)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

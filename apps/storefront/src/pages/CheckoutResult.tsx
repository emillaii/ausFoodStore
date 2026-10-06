import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, ErrorState, Loading, Price, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { AttemptResponse } from '@aus/contracts';
import type { CheckoutAttempt, Order } from '@aus/contracts';

export default function CheckoutResult() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [guestCode, setGuestCode] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const attemptQuery = useQuery<AttemptResponse, ApiClientError>({
    queryKey: ['attempt', id],
    queryFn: () => api.checkoutAttempt(id!),
    refetchInterval: (q) => {
      const status = q.state.data?.attempt.status;
      return status === 'PAYMENT_PENDING' ? 3000 : false;
    },
  });

  const attempt = attemptQuery.data?.attempt;

  useEffect(() => {
    if (attempt?.status === 'PAID' && attempt.orderId && !order) {
      api.order(attempt.orderId).then(setOrder).catch(() => setOrder(null));
    }
  }, [attempt, order]);

  // Store the guest access code once, so refresh keeps access (scoped mechanism).
  useEffect(() => {
    if (order && !order.customerId && order.guestAccessCode) setGuestCode(order.guestAccessCode);
  }, [order]);

  const completePending = useMutation({
    mutationFn: () => api.completePendingPayment(id!),
    onSuccess: () => attemptQuery.refetch(),
  });

  if (attemptQuery.isLoading) return <Loading label="Checking payment status…" />;
  if (attemptQuery.error) return <ErrorState error={attemptQuery.error} onRetry={() => attemptQuery.refetch()} />;
  if (!attempt) return null;

  const status = attempt.status;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {status === 'PAID' && (
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }} aria-hidden="true">✅</div>
          <h1>Order confirmed</h1>
          <p><StatusBadge status="PAID" /> <StatusBadge status={order?.fulfilmentStatus ?? 'READY_TO_PICK'} /></p>
          {order ? (
            <>
              <p className="muted">Order <strong>{order.number}</strong> · <Price cents={order.totalCents} /></p>
              {guestCode && (
                <p className="small">
                  Guest access code: <span className="kbd">{guestCode}</span> — save it to view this order later
                  (order number + email + code are required together).
                </p>
              )}
              <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                {order.customerId
                  ? <Link className="btn btn-primary" to={`/account/orders/${order.id}`}>View order</Link>
                  : <GuestOrderLink order={order} code={guestCode} />}
                <Link className="btn btn-secondary" to="/">Keep shopping</Link>
              </div>
              <p className="xsmall muted mt-4">A confirmation document was generated (demo — no real email sent).</p>
            </>
          ) : (
            <Loading label="Loading order…" />
          )}
        </div>
      )}

      {status === 'PAYMENT_PENDING' && (
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }} aria-hidden="true">⏳</div>
          <h1>Payment pending</h1>
          <p className="muted">
            The simulated provider hasn't confirmed yet. This page refreshes automatically — the order is created only when the provider confirms.
          </p>
          <p><StatusBadge status="PAYMENT_PENDING" /></p>
          <Button loading={completePending.isPending} onClick={() => completePending.mutate()}>
            Simulate provider webhook confirmation
          </Button>
        </div>
      )}

      {status === 'FAILED' && (
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }} aria-hidden="true">❌</div>
          <h1>Payment declined</h1>
          <p className="muted">No money has moved. Your stock hold was released — the cart is unchanged.</p>
          <Link className="btn btn-primary" to="/checkout">Try payment again</Link>
        </div>
      )}

      {status === 'EXPIRED' && (
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }} aria-hidden="true">⌛</div>
          <h1>Checkout expired</h1>
          <p className="muted">The 15-minute reservation ran out and the stock was released for other shoppers. Your cart is unchanged — start a new checkout.</p>
          <Link className="btn btn-primary" to="/checkout">Start new checkout</Link>
        </div>
      )}

      {status === 'CANCELLED' && (
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }} aria-hidden="true">🚫</div>
          <h1>Checkout cancelled</h1>
          <p className="muted">Stock and coin holds were released. Your cart is unchanged.</p>
          <Link className="btn btn-primary" to="/cart">Back to cart</Link>
        </div>
      )}
    </div>
  );
}

function GuestOrderLink({ order, code }: { order: Order; code: string | null }) {
  return (
    <Link
      className="btn btn-primary"
      to={`/order-lookup?number=${order.number}&email=${encodeURIComponent(order.contact.email)}&code=${code ?? ''}`}
      onClick={(e) => {
        e.preventDefault();
        alert(`Guest order access (demo):\n\nOrder ${order.number}\nEmail ${order.contact.email}\nAccess code ${code}\n\nUse these three together on the order lookup page — the ID alone is never sufficient.`);
      }}
    >
      How to view this order later
    </Link>
  );
}

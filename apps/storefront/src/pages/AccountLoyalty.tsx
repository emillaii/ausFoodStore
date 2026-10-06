import { useQuery } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { Badge, ErrorState, Loading } from '@aus/ui';

export default function AccountLoyalty() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['loyalty'], queryFn: () => api.loyalty() });
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  const { balance, transactions, rules } = data;
  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Loyalty coins 🪙</h1>
      <div className="account-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div className="xsmall muted">AVAILABLE</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--loyalty-700)' }}>{balance.available}</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div className="xsmall muted">PENDING</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{balance.pending}</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div className="xsmall muted">HELD AT CHECKOUT</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{balance.held}</div>
        </div>
      </div>

      <div className="card card-pad mt-4 small">
        <strong>Sample rules</strong> <Badge tone="warn">not customer-approved terms</Badge>
        <p className="mb-0 mt-2">
          Earn {rules.coinsPerDollar} coin per whole AUD 1 after discounts (shipping excluded). Paid orders create <em>pending</em> coins;
          they become available when the order fully ships. {rules.coinsPerDollarValue} coins = $1 off, redeemed in steps of {rules.redemptionStep}.
          Refunds reverse earned coins proportionally and release redeemed coins when checkouts fail or expire.
        </p>
      </div>

      <h2 className="mt-6">Ledger</h2>
      <div className="card card-pad">
        {transactions.length === 0 && <p className="muted mb-0">No coin activity yet — place an order to start earning.</p>}
        {transactions.map((t) => (
          <div className="ledger-row" key={t.id}>
            <div>
              <strong>{t.type.replaceAll('_', ' ').toLowerCase()}</strong>
              <div className="muted xsmall">{t.reference} · {new Date(t.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}{t.reason ? ` · ${t.reason}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {t.deltaPending !== 0 && <div className={t.deltaPending > 0 ? 'price' : 'field-error'}>{t.deltaPending > 0 ? '+' : ''}{t.deltaPending} pending</div>}
              {t.deltaAvailable !== 0 && <div className={t.deltaAvailable > 0 ? 'price' : 'field-error'}>{t.deltaAvailable > 0 ? '+' : ''}{t.deltaAvailable}</div>}
              {t.deltaPending === 0 && t.deltaAvailable === 0 && <span className="muted">commit</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

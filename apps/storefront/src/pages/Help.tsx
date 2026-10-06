import { Link } from 'react-router-dom';

const TOPICS = [
  { icon: '🚚', title: 'Delivery', to: '/policies/delivery', body: 'Fees, free-shipping threshold and serviceable areas (sample rates).' },
  { icon: '↩️', title: 'Returns & refunds', to: '/policies/returns', body: 'How to request a return from your order detail page.' },
  { icon: '🪙', title: 'Loyalty coins', to: '/policies/loyalty', body: 'How coins are earned, held and redeemed (sample rules).' },
  { icon: '🔒', title: 'Privacy', to: '/policies/privacy', body: 'What this demo stores and how deletion requests work.' },
];

export default function Help() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Help &amp; contact</h1>
      <p className="muted">This is a demo storefront. Support contacts are placeholders.</p>
      <div className="card card-pad mt-4">
        <h3>Contact</h3>
        <p className="mb-0 small">
          📞 (02) 5550 1234 (demo) · ✉️ help@ausfoodstore.demo<br />
          Mon–Fri 9am–5pm AEST (sample hours)
        </p>
      </div>
      <div className="stack mt-4">
        {TOPICS.map((t) => (
          <Link key={t.to} to={t.to} className="card card-pad row" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span style={{ fontSize: 24 }} aria-hidden="true">{t.icon}</span>
            <span className="grow">
              <strong>{t.title}</strong>
              <div className="small muted">{t.body}</div>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

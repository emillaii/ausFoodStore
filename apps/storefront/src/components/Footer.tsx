import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <strong>Aus Meat Co.</strong>
          <div className="small">Premium Australian meat, delivered — demo prototype, no real payments.</div>
        </div>
        <nav aria-label="Footer" className="stack" style={{ gap: 6 }}>
          <Link to="/help">Help &amp; contact</Link>
          <Link to="/policies/delivery">Delivery</Link>
          <Link to="/policies/returns">Returns &amp; refunds</Link>
          <Link to="/policies/privacy">Privacy</Link>
          <Link to="/policies/loyalty">Loyalty coins</Link>
        </nav>
        <div className="small">
          <div>Prices include GST where applicable (sample classification).</div>
          <div>Sample loyalty rule: 1 coin per AUD 1 · 100 coins = $1.</div>
        </div>
      </div>
    </footer>
  );
}

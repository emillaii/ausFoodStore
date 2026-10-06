import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ProductGrid } from '../components/ProductCard';
import { Badge, ErrorState, Loading, EmptyState } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { HomeView } from '@aus/contracts';

export default function Home() {
  const { customer } = useAuth();
  const { data, isLoading, error, refetch } = useQuery<HomeView>({ queryKey: ['home'], queryFn: () => api.home() });

  if (isLoading) return <Loading label="Loading the store…" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return <EmptyState title="Nothing here yet" />;

  return (
    <div>
      {data.banners[0] && (
        <Link
          to={data.banners[0].destinationPath}
          className="hero"
          style={{ '--hero-a': `hsl(${data.banners[0].hue} 48% 34%)`, '--hero-b': `hsl(${(data.banners[0].hue + 25) % 360} 45% 18%)` } as CSSProperties}
        >
          <Badge tone="warn" dot>This week at the butcher</Badge>
          <h2>{data.banners[0].title}</h2>
          <p>{data.banners[0].subtitle}</p>
          <span className="hero-cta">Shop the collection →</span>
          <span className="glyph" aria-hidden="true">{data.banners[0].glyph}</span>
        </Link>
      )}

      <div className="cat-grid mt-6" aria-label="Category shortcuts">
        {data.topCategories.map((c) => (
          <Link key={c.id} to={`/categories/${c.slug}`} className="cat-tile">
            <span className="ico" aria-hidden="true">{c.imageGlyph ?? '🏷️'}</span>
            {c.name}
          </Link>
        ))}
      </div>

      <section className="section-title">
        <h2>Deals this week</h2>
        <Link className="small" to="/search?sale=1">See all specials</Link>
      </section>
      {data.deals.length === 0
        ? <EmptyState icon="🏷️" title="No specials right now" body="Check back soon." />
        : <ProductGrid products={data.deals} />}

      {customer?.member && data.memberSpecials.length > 0 && (
        <>
          <section className="section-title">
            <h2>Your member specials</h2>
            <Badge tone="loyalty">Member</Badge>
          </section>
          <ProductGrid products={data.memberSpecials} />
        </>
      )}

      <section className="section-title">
        <h2>Popular right now</h2>
      </section>
      <ProductGrid products={data.popular} />

      <section className="section-title">
        <h2>New in store</h2>
      </section>
      <ProductGrid products={data.isNew} />

      {data.banners.length > 1 && (
        <div className="prod-grid mt-6">
          {data.banners.slice(1).map((b) => (
            <Link
              key={b.id}
              to={b.destinationPath}
              className="hero"
              style={{ minHeight: 150, '--hero-a': `hsl(${b.hue} 48% 36%)`, '--hero-b': `hsl(${(b.hue + 25) % 360} 45% 20%)` } as CSSProperties}
            >
              <h3 style={{ color: '#fff', margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>{b.title}</h3>
              <p className="small">{b.subtitle}</p>
              <span className="hero-cta">Explore →</span>
              <span className="glyph" aria-hidden="true" style={{ fontSize: 72 }}>{b.glyph}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="card card-pad mt-6 small muted">
        🚚 Free delivery on orders over <strong>{formatAud(data.freeShippingThresholdCents)}</strong> (sample rate) · otherwise {formatAud(990)} flat.
      </div>
    </div>
  );
}

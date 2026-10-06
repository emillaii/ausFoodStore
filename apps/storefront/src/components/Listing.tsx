/** Shared listing UI: filter chips, sort select, load-more paging. Used by /search and /categories/:slug. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { ProductView } from '../lib/types';
import { ProductGrid } from '../components/ProductCard';
import { Button, EmptyState, ErrorState, Loading } from '@aus/ui';

export interface ListingParams {
  q?: string;
  category?: string;
  lockCategory?: boolean;
  title: string;
  subtitle?: string;
  emptyTitle?: string;
  emptyBody?: string;
}

const SORTS = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
];

export default function Listing({ q, category, lockCategory, title, subtitle, emptyTitle, emptyBody }: ListingParams) {
  const [params, setParams] = useSearchParams();
  const sort = params.get('sort') ?? 'relevance';
  const inStock = params.get('inStock') === '1';
  const sale = params.get('sale') === '1';
  const brand = params.get('brand');
  const pageSize = 24;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['listing', q, category, sort, inStock, sale, brand],
    queryFn: () => api.products({ q, category, sort, inStock: inStock ? 1 : undefined, sale: sale ? 1 : undefined, brand: brand ?? undefined, pageSize }),
  });

  const [visible, setVisible] = useState(pageSize);
  const items: ProductView[] = data?.items ?? [];
  const shown = items.slice(0, visible);

  const setParam = (key: string, value: string | null) => {
    setVisible(pageSize);
    const next = new URLSearchParams(params);
    if (value == null || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  if (isLoading) return <Loading label="Finding products…" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}

      <div className="filters-bar" role="group" aria-label="Filters and sorting">
        {!lockCategory && (
          <button className={`chip ${sale ? 'on' : ''}`} aria-pressed={sale} onClick={() => setParam('sale', sale ? null : '1')}>On special</button>
        )}
        <button className={`chip ${inStock ? 'on' : ''}`} aria-pressed={inStock} onClick={() => setParam('inStock', inStock ? null : '1')}>In stock</button>
        {(data?.brands ?? []).filter(Boolean).slice(0, 6).map((b) => (
          <button key={b} className={`chip ${brand === b ? 'on' : ''}`} aria-pressed={brand === b} onClick={() => setParam('brand', brand === b ? null : b!)}>{b}</button>
        ))}
        <label className="small muted" htmlFor="sort-select" style={{ marginLeft: 'auto' }}>Sort</label>
        <select id="sort-select" className="select input-sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setParam('sort', e.target.value)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <p className="small muted" aria-live="polite">{data?.total ?? 0} products</p>

      {items.length === 0 ? (
        <EmptyState
          icon="🔍" title={emptyTitle ?? 'No products match'}
          body={emptyBody ?? 'Try removing a filter or searching for something else.'}
          action={<Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button>}
        />
      ) : (
        <>
          <ProductGrid products={shown} />
          {items.length > shown.length && (
            <div className="mt-6" style={{ textAlign: 'center' }}>
              <Button variant="secondary" onClick={() => setVisible((v) => v + pageSize)}>
                Load more ({items.length - shown.length} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

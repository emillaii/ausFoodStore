import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CategoryView } from '../lib/types';
import { EmptyState, ErrorState, Loading } from '@aus/ui';

export default function Categories() {
  const { slug } = useParams();
  const { data, isLoading, error, refetch } = useQuery<CategoryView[]>({ queryKey: ['categories'], queryFn: () => api.categories() });
  const [selected, setSelected] = useState(slug ?? null);

  const top = useMemo(() => (data ?? []).filter((c) => c.parentId === null), [data]);
  const activeId = selected ?? top[0]?.id ?? null;
  const subs = useMemo(() => (data ?? []).filter((c) => c.parentId === activeId), [data, activeId]);
  const active = (data ?? []).find((c) => c.id === activeId);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <h1>Categories</h1>
      <div className="cat-browser card card-pad">
        <nav className="cat-list" aria-label="Top-level categories">
          {top.map((c) => (
            <button
              key={c.id}
              className={c.id === activeId ? 'on' : ''}
              aria-current={c.id === activeId ? 'true' : undefined}
              onClick={() => setSelected(c.id)}
            >
              <span aria-hidden="true">{c.imageGlyph} </span>{c.name}
            </button>
          ))}
        </nav>
        <div>
          <h2 className="mt-0">
            {active?.imageGlyph}{' '}{active?.name}
          </h2>
          {subs.length > 0 ? (
            <div className="prod-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              <Link to={`/categories/${active?.slug}`} className="cat-tile" style={{ minHeight: 90, justifyContent: 'center' }}>
                <span className="ico" aria-hidden="true">{active?.imageGlyph}</span>
                All {active?.name}
              </Link>
              {subs.map((s) => (
                <Link key={s.id} to={`/categories/${s.slug}`} className="cat-tile" style={{ minHeight: 90, justifyContent: 'center' }}>
                  <span className="ico" aria-hidden="true">{s.imageGlyph}</span>
                  {s.name}
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon="🗂️" title="No subcategories" body={`Browse all of ${active?.name}.`} action={<Link className="btn btn-primary" style={{ display: 'inline-flex' }} to={`/categories/${active?.slug}`}>Shop {active?.name}</Link>} />
          )}
        </div>
      </div>
    </div>
  );
}

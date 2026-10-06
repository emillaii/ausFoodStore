import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import Listing from '../components/Listing';

export default function CategoryListing() {
  const { slug } = useParams();
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.categories(), staleTime: 300_000 });
  const cat = (categories ?? []).find((c) => c.slug === slug);
  const parent = (categories ?? []).find((c) => c.id === cat?.parentId);
  return (
    <Listing
      category={slug}
      lockCategory
      title={cat ? `${cat.imageGlyph} ${cat.name}` : 'Category'}
      subtitle={parent ? `In ${parent.name} · ` : ''} 
      emptyTitle="Nothing in this category yet"
      emptyBody="Stock is on its way — check another category."
    />
  );
}

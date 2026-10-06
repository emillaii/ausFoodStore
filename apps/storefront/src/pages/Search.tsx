import { useSearchParams } from 'react-router-dom';
import Listing from '../components/Listing';

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <Listing
      q={q || undefined}
      title={q ? `Results for “${q}”` : 'Search'}
      subtitle={q ? undefined : 'Type in the search bar above to find products.'}
      emptyTitle={q ? `No matches for “${q}”` : 'Start searching'}
      emptyBody={q ? 'Check the spelling, or try a shorter term like “milk”.' : 'Try “milk”, “coffee” or “eggs”.'}
    />
  );
}

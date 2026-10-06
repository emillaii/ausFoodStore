import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorState, Loading } from '@aus/ui';

export default function Policy() {
  const { slug } = useParams();
  const [page, setPage] = useState<{ title: string; body: string } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setPage(null);
    setError(null);
    fetch(`/api/settings/policies/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Policy not found.'))))
      .then((j) => setPage(j.data))
      .catch(setError);
  }, [slug]);

  if (error) return <ErrorState title="Policy unavailable" error={error} />;
  if (!page) return <Loading />;
  return (
    <div style={{ maxWidth: 720 }}>
      <h1>{page.title}</h1>
      <div className="card card-pad policy-body">{page.body}</div>
      <p className="small muted mt-4">Editable in Admin → Settings → Policy content. Sample text — requires retailer approval before production use.</p>
    </div>
  );
}

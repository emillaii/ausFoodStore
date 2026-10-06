import { EmptyState } from '@aus/ui';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <EmptyState
      icon="🧭" title="Page not found"
      body="The page you're looking for doesn't exist or was moved."
      action={<Link className="btn btn-primary" style={{ display: 'inline-flex' }} to="/">Back to home</Link>}
    />
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { DocumentPreview } from '../components/DocumentPreview';
import { Button, ErrorState, Loading, StatusBadge } from '@aus/ui';
import type { DocumentMeta } from '@aus/contracts';

const TYPES = ['ORDER_CONFIRMATION', 'INVOICE', 'RECEIPT', 'PACKING_SLIP', 'CREDIT_NOTE'];

export default function Documents() {
  const [type, setType] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery<{ items: (DocumentMeta & { orderTotalCents: number })[] }, ApiClientError>({
    queryKey: ['admin-documents', type],
    queryFn: () => api.admin.documents(type || undefined),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <div className="page-head">
        <h1>Documents</h1>
        <select className="select input-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}
        </select>
      </div>
      <p className="small muted">Documents are generated from frozen order snapshots. Previews are printable and watermarked Demo — production stores real PDFs privately with expiring access.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Number</th><th>Type</th><th>Order</th><th>Issued</th><th>By</th><th>State</th><th></th></tr></thead>
          <tbody>
            {(data?.items ?? []).length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>No documents.</td></tr>}
            {(data?.items ?? []).map((d) => (
              <tr key={d.id}>
                <td><strong>{d.number}</strong></td>
                <td className="small">{d.type.replaceAll('_', ' ')}</td>
                <td className="small">{d.orderNumber}</td>
                <td className="small muted">{new Date(d.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="small muted">{d.createdBy}</td>
                <td><StatusBadge status={d.state} /></td>
                <td><Button size="sm" variant="secondary" onClick={() => setPreview(d.id)}>Preview</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DocumentPreview docId={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

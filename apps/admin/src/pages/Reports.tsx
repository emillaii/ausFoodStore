import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { RangePicker } from '../components/DataTable';
import { Button, ErrorState, Loading } from '@aus/ui';
import { formatAud } from '@aus/contracts';

const REPORTS = [
  { type: 'sales-by-date', label: 'Sales by date' },
  { type: 'sales-by-sku', label: 'Sales by SKU' },
  { type: 'order-status', label: 'Order status counts' },
  { type: 'refunds', label: 'Refunds' },
  { type: 'low-stock', label: 'Low stock' },
  { type: 'stock-movements', label: 'Stock movements' },
  { type: 'coins', label: 'Coins issued / redeemed' },
] as const;

interface ReportData { columns: string[]; rows: { label: string; values: Record<string, number | string> }[] }

/** CSV export with formula-like cell escaping (=+-@ prefixes) per brief §7.2. */
function exportCsv(filename: string, data: ReportData): void {
  const esc = (v: unknown): string => {
    const s = String(v ?? '');
    const needsQuoting = /[",\n]/.test(s);
    const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return needsQuoting ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  const lines = [
    ['label', ...data.columns].map(esc).join(','),
    ...data.rows.map((r) => [r.label, ...data.columns.map((c) => r.values[c])].map(esc).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [type, setType] = useState<string>('sales-by-date');
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading, error, refetch } = useQuery<ReportData, ApiClientError>({
    queryKey: ['report', type, range],
    queryFn: () => api.admin.report(type, range),
  });

  const moneyColumns = type === 'sales-by-date' ? ['revenueCents'] : type === 'sales-by-sku' ? ['revenueCents'] : type === 'refunds' ? ['amountCents'] : [];

  return (
    <div>
      <div className="page-head">
        <h1>Reports</h1>
        <div className="row wrap">
          <select className="select input-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Report type">
            {REPORTS.map((r) => <option key={r.type} value={r.type}>{r.label}</option>)}
          </select>
          <RangePicker from={range.from} to={range.to} onChange={setRange} />
          <Button size="sm" variant="secondary" disabled={!data || data.rows.length === 0} onClick={() => data && exportCsv(`${type}-${range.from || '30d'}-${range.to || 'today'}.csv`, data)}>
            ⬇ Export CSV
          </Button>
        </div>
      </div>
      <p className="small muted">Times shown in store timezone ({'Australia/Sydney'} — demo setting). CSV cells beginning with =, +, - or @ are escaped to guard against spreadsheet formula injection.</p>

      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {data && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Label</th>
                {data.columns.map((c) => (
                  <th key={c} style={{ textAlign: 'right' }}>{c.endsWith('Cents') ? `${c.replace('Cents', ' (AUD)')}` : c.replaceAll('_', ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && <tr><td colSpan={data.columns.length + 1} className="muted" style={{ textAlign: 'center', padding: 24 }}>No data in range.</td></tr>}
              {data.rows.map((r, i) => (
                <tr key={`${r.label}-${i}`}>
                  <td><strong>{r.label}</strong></td>
                  {data.columns.map((c) => (
                    <td key={c} className="num">
                      {moneyColumns.includes(c) ? formatAud(Number(r.values[c])) : String(r.values[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

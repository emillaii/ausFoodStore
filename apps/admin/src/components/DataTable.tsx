import React, { useState } from 'react';
import { formatAud } from '@aus/contracts';

/** Searchable, sortable data table with toolbar helpers. */
export function DataTable<T>({
  rows, columns, rowKey, search, onSearch, searchPlaceholder, toolbar, empty, footer, initialSort,
}: {
  rows: T[];
  columns: { key: string; header: string; render: (row: T) => React.ReactNode; numeric?: boolean; sortValue?: (row: T) => string | number }[];
  rowKey: (row: T) => string;
  search?: string;
  onSearch?: (q: string) => void;
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  initialSort?: { key: string; dir: 1 | -1 };
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ?? null);

  const sorted = [...rows];
  if (sort) {
    const col = columns.find((c) => c.key === sort.key);
    if (col?.sortValue) {
      sorted.sort((a, b) => {
        const av = col.sortValue!(a);
        const bv = col.sortValue!(b);
        return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
      });
    }
  }

  return (
    <div>
      {(onSearch || toolbar) && (
        <div className="toolbar">
          {onSearch && (
            <input
              className="input input-sm" style={{ width: 260 }}
              type="search" placeholder={searchPlaceholder ?? 'Search…'} aria-label="Search"
              value={search ?? ''} onChange={(e) => onSearch(e.target.value)}
            />
          )}
          {toolbar}
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={c.numeric ? { textAlign: 'right' } : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  {c.sortValue ? (
                    <button
                      style={{ all: 'unset', cursor: 'pointer', fontWeight: 700 }}
                      onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}
                    >
                      {c.header}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={columns.length} className="muted" style={{ textAlign: 'center', padding: 24 }}>{empty ?? 'No rows.'}</td></tr>
            )}
            {sorted.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? 'num' : undefined}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function Money({ cents }: { cents: number }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatAud(cents)}</span>;
}

export function RangePicker({ from, to, onChange }: { from: string; to: string; onChange: (range: { from: string; to: string }) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  return (
    <span className="row small">
      <label htmlFor="rng-from">From</label>
      <input id="rng-from" type="date" className="input input-sm" value={from || d30} max={today} onChange={(e) => onChange({ from: e.target.value, to: to || today })} />
      <label htmlFor="rng-to">to</label>
      <input id="rng-to" type="date" className="input input-sm" value={to || today} max={today} onChange={(e) => onChange({ from: from || d30, to: e.target.value })} />
    </span>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { Button, ErrorState, Field, Loading, Modal, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { Banner, Promotion } from '@aus/contracts';

interface PromoRow extends Promotion { skuCode?: string; productName?: string; basePriceCents?: number }

export default function Promotions() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<{ promotions: PromoRow[]; banners: Banner[] }, ApiClientError>({
    queryKey: ['admin-promotions'],
    queryFn: () => api.admin.promotions(),
  });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const deletePromo = useMutation({
    mutationFn: (id: string) => api.admin.deletePromotion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-promotions'] }); setMessage('Promotion removed — sale price cleared.'); },
    onError: (e) => setMessage((e as ApiClientError).message),
  });
  const toggleBanner = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.admin.updateBanner(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-promotions'] }),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  const now = Date.now();
  return (
    <div>
      <div className="page-head">
        <h1>Promotions</h1>
        <Button onClick={() => setCreating(true)}>+ New SKU sale</Button>
      </div>
      {message && <p className="small" role="status">{message}</p>}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>SKU</th><th>Sale price</th><th>Window</th><th>State</th><th></th></tr></thead>
          <tbody>
            {(data?.promotions ?? []).map((p) => {
              const start = new Date(p.startsAt).getTime();
              const end = new Date(p.endsAt).getTime();
              const state = !p.active ? 'DRAFT' : now < start ? 'PENDING' : now > end ? 'ARCHIVED' : 'ACTIVE';
              return (
                <tr key={p.id}>
                  <td><strong>{p.skuCode}</strong><div className="xsmall muted">{p.productName} · base {formatAud(p.basePriceCents ?? 0)}</div></td>
                  <td><strong style={{ color: 'var(--sale-700)' }}>{formatAud(p.salePriceCents)}</strong></td>
                  <td className="small muted">{new Date(p.startsAt).toLocaleDateString('en-AU')} → {new Date(p.endsAt).toLocaleDateString('en-AU')}</td>
                  <td><StatusBadge status={state} /></td>
                  <td>{state !== 'ARCHIVED' && <Button size="sm" variant="ghost" onClick={() => deletePromo.mutate(p.id)}>Remove</Button>}</td>
                </tr>
              );
            })}
            {(data?.promotions ?? []).length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }}>No scheduled sales.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6">Homepage banners</h2>
      <div className="stack">
        {(data?.banners ?? []).map((b) => (
          <div className="card card-pad row-between" key={b.id}>
            <div className="row">
              <div className="pimg pimg-md" style={{ background: `linear-gradient(135deg, hsl(${b.hue} 45% 88%), hsl(${b.hue + 40} 40% 78%))`, fontSize: 34 }}>{b.glyph}</div>
              <div>
                <strong>{b.title}</strong>
                <div className="small muted">{b.subtitle} → <span className="kbd">{b.destinationPath}</span> · order {b.displayOrder}</div>
              </div>
            </div>
            <div className="row">
              <StatusBadge status={b.active ? 'ACTIVE' : 'DRAFT'} />
              <Button size="sm" variant="secondary" onClick={() => toggleBanner.mutate({ id: b.id, active: !b.active })}>
                {b.active ? 'Unpublish' : 'Publish'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <PromoModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function PromoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [skuSearch, setSkuSearch] = useState('');
  const [skuId, setSkuId] = useState<string | null>(null);
  const [skuLabel, setSkuLabel] = useState('');
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [salePrice, setSalePrice] = useState('');
  const [starts, setStarts] = useState(new Date().toISOString().slice(0, 10));
  const [ends, setEnds] = useState(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = useQuery({
    queryKey: ['promo-sku-options', skuSearch],
    queryFn: () => api.admin.products({ q: skuSearch, pageSize: 8 }),
    enabled: open && skuSearch.trim().length >= 2,
  });

  const save = async () => {
    setError(null);
    if (!skuId) return setError('Pick a SKU.');
    const price = Number(salePrice);
    if (!price || price <= 0) return setError('Enter a sale price in cents.');
    setBusy(true);
    try {
      await api.admin.createPromotion({ skuId, salePriceCents: price, startsAt: new Date(starts + 'T00:00:00').toISOString(), endsAt: new Date(ends + 'T23:59:59').toISOString(), label: label || undefined });
      qc.invalidateQueries({ queryKey: ['admin-promotions'] });
      onClose();
    } catch (e) {
      setError((e as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New SKU sale">
      {!skuId ? (
        <>
          <Field label="Find SKU" htmlFor="pr-sku" hint="Type at least 2 characters">
            <input id="pr-sku" className="input" value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)} />
          </Field>
          {(options.data?.items ?? []).flatMap((p: { id: string; name: string; skus: { id: string; code: string; priceCents: number }[] }) =>
            p.skus.map((s) => (
              <button key={s.id} className="suggest-item" onClick={() => { setSkuId(s.id); setSkuLabel(`${p.name} · ${s.code}`); setBasePrice(s.priceCents); }}>
                <span className="grow">{p.name} <span className="muted small">{s.code}</span></span>
                <span>{formatAud(s.priceCents)}</span>
              </button>
            )),
          )}
        </>
      ) : (
        <>
          <p className="small">SKU: <strong>{skuLabel}</strong> (base {formatAud(basePrice ?? 0)}) <button className="btn btn-ghost btn-sm" onClick={() => { setSkuId(null); setBasePrice(null); }}>change</button></p>
          <Field label="Sale price (cents)" htmlFor="pr-price" hint="Preview before publication — goes live in the window below" error={error ?? undefined}>
            <input id="pr-price" className="input" type="number" min={1} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </Field>
          <div className="row">
            <Field label="Starts" htmlFor="pr-start"><input id="pr-start" className="input" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} /></Field>
            <Field label="Ends" htmlFor="pr-end"><input id="pr-end" className="input" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></Field>
          </div>
          <Field label="Label (optional)" htmlFor="pr-label"><input id="pr-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Weekend special" /></Field>
          {salePrice && basePrice && Number(salePrice) >= basePrice && (
            <p className="field-error" role="alert">Sale price must be below the base price.</p>
          )}
          <Button block loading={busy} onClick={save} disabled={!salePrice || (basePrice != null && Number(salePrice) >= basePrice)}>
            Schedule sale
          </Button>
        </>
      )}
    </Modal>
  );
}

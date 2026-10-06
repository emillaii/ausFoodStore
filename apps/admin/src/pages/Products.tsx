import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import { Badge, Button, ErrorState, Field, Loading, Modal, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { Category, Product } from '@aus/contracts';

interface ProductRow extends Product {
  skus: (Product['skus'][number] & { available?: number })[];
}

interface SkuDraft {
  id?: string; code: string; packSize?: string; priceCents: number; memberPriceCents?: number;
  salePriceCents?: number; saleStartsAt?: string; saleEndsAt?: string;
  taxClass: 'GST' | 'GST_FREE'; active: boolean; optionLabel?: string;
}

export default function Products({ editorMode }: { editorMode?: 'new' | 'edit' }) {
  const params = useParams();
  const editId = editorMode ? (params.id ?? (editorMode === 'new' ? 'new' : null)) : null;
  if (editorMode) return <ProductEditor id={editId} />;
  return <ProductList />;
}

function ProductList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-products', q, status, page],
    queryFn: () => api.admin.products({ q, status, page, pageSize: 12 }),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div>
      <div className="page-head">
        <h1>Products</h1>
        <Link className="btn btn-primary" to="/products/new" style={{ display: 'inline-flex' }}>+ New product</Link>
      </div>
      <DataTable
        rows={data?.items ?? []}
        rowKey={(p: ProductRow) => p.id}
        search={q} onSearch={setQ} searchPlaceholder="Search name or SKU…"
        toolbar={
          <select className="select input-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        }
        columns={[
          { key: 'name', header: 'Product', sortValue: (p) => p.name, render: (p) => (
            <span><span aria-hidden="true">{p.imageGlyph} </span><Link to={`/products/${p.id}`}><strong>{p.name}</strong></Link><div className="xsmall muted">{p.brand}</div></span>
          ) },
          { key: 'skus', header: 'SKUs', render: (p) => (
            <span className="small">{p.skus.map((s) => s.code).join(', ')}</span>
          ) },
          { key: 'price', header: 'Price', numeric: true, sortValue: (p) => p.skus[0]?.priceCents ?? 0, render: (p) => {
            const s = p.skus[0];
            return s ? formatAud(s.priceCents) : '—';
          } },
          { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge status={p.status} /> },
          { key: 'actions', header: '', render: (p) => (
            <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              {p.status === 'DRAFT' && <PublishButton id={p.id} />}
              {p.status === 'ACTIVE' && <ArchiveButton id={p.id} />}
              {p.status === 'ARCHIVED' && <UnarchiveButton id={p.id} />}
              <Link className="btn btn-ghost btn-sm" to={`/products/${p.id}`}>Edit</Link>
            </span>
          ) },
        ]}
        footer={
          <div className="row-between small" style={{ padding: 10 }}>
            <span className="muted">Page {data?.page ?? 1} of {Math.max(1, Math.ceil((data?.total ?? 0) / 12))} · {data?.total ?? 0} products</span>
            <span className="row">
              <Button size="sm" variant="secondary" disabled={(data?.page ?? 1) <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button size="sm" variant="secondary" disabled={(data?.page ?? 1) >= Math.ceil((data?.total ?? 0) / 12)} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </span>
          </div>
        }
      />
    </div>
  );
}

function statusAction(id: string, action: 'publish' | 'archive' | 'draft', label: string, tone: 'primary' | 'secondary' | 'ghost') {
  const qc = useQueryClient();
  return (
    <Button size="sm" variant={tone} loading={false} onClick={async () => { await api.admin.setProductStatus(id, action); qc.invalidateQueries(); }}>
      {label}
    </Button>
  );
}
function PublishButton({ id }: { id: string }) { return statusAction(id, 'publish', 'Publish', 'primary'); }
function ArchiveButton({ id }: { id: string }) { return statusAction(id, 'archive', 'Archive', 'secondary'); }
function UnarchiveButton({ id }: { id: string }) { return statusAction(id, 'draft', 'Re-draft', 'ghost'); }

function ProductEditor({ id }: { id: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = !id || id === 'new';
  const existing = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => api.admin.product(id!),
    enabled: !isNew,
  });
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: () => api.admin.categories() });

  const [form, setForm] = useState(() => ({
    name: '', brand: '', description: '', imageGlyph: '🛒', imageHue: 150,
    categoryIds: [] as string[], status: 'DRAFT' as Product['status'],
    skus: [{ code: '', packSize: '', priceCents: 0, taxClass: 'GST' as const, active: true }] as SkuDraft[],
  }));
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && existing.data && loadedId !== existing.data.id) {
      const p = existing.data;
      setForm({
        name: p.name, brand: p.brand ?? '', description: p.description,
        imageGlyph: p.imageGlyph, imageHue: p.imageHue, categoryIds: [...p.categoryIds],
        status: p.status,
        skus: p.skus.map((s: Product['skus'][number]) => ({
          id: s.id, code: s.code, packSize: s.packSize, priceCents: s.priceCents,
          memberPriceCents: s.memberPriceCents, salePriceCents: s.salePriceCents,
          saleStartsAt: s.saleStartsAt, saleEndsAt: s.saleEndsAt, taxClass: s.taxClass, active: s.active,
          optionLabel: Object.entries(s.optionValues).map(([k, v]) => `${k}:${v}`).join('|'),
        })),
      });
      setLoadedId(p.id);
    }
  }, [existing.data, isNew, loadedId]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        expectedUpdatedAt: existing.data?.updatedAt,
        skus: form.skus.map((s) => ({
          id: s.id, code: s.code, packSize: s.packSize || undefined,
          priceCents: Number(s.priceCents), memberPriceCents: s.memberPriceCents || undefined,
          salePriceCents: s.salePriceCents || undefined,
          saleStartsAt: s.saleStartsAt || undefined, saleEndsAt: s.saleEndsAt || undefined,
          taxClass: s.taxClass, active: s.active,
          optionValues: parseOptionLabel(s.optionLabel),
        })),
      };
      return isNew ? api.admin.saveProduct(payload) : api.admin.updateProduct(id!, payload);
    },
    onSuccess: (p: Product) => {
      qc.invalidateQueries();
      navigate(`/products/${p.id}`);
    },
    onError: (e) => {
      const err = e as ApiClientError;
      if (err.code === 'VERSION_CONFLICT') setConflict(err.message);
      else setErrors({ form: err.message });
    },
  });

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;

  const setSku = (i: number, patch: Partial<SkuDraft>) => {
    setForm({ ...form, skus: form.skus.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required.';
    for (const [i, s] of form.skus.entries()) {
      if (!s.code.trim()) errs[`sku-${i}-code`] = 'Code required.';
      if (!Number(s.priceCents) || Number(s.priceCents) <= 0) errs[`sku-${i}-price`] = 'Price must be > 0.';
      if (s.salePriceCents && Number(s.salePriceCents) >= Number(s.priceCents)) errs[`sku-${i}-sale`] = 'Sale price must be below base price.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-head">
        <h1>{isNew ? 'New product' : `Edit — ${form.name}`}</h1>
        <div className="row">
          <Badge tone={form.status === 'ACTIVE' ? 'success' : form.status === 'DRAFT' ? 'neutral' : 'warn'}>{form.status.toLowerCase()}</Badge>
        </div>
      </div>
      {errors.form && <p className="field-error" role="alert">{errors.form}</p>}
      {conflict && (
        <div className="card card-pad mb-4" style={{ background: 'var(--warn-100)', borderColor: 'var(--warn-700)' }} role="alert">
          <strong>Conflict: </strong>{conflict}
          <Button size="sm" variant="secondary" className="ml-2" onClick={() => { existing.refetch(); setConflict(null); }}>Reload latest</Button>
        </div>
      )}

      <div className="card card-pad">
        <h3>Details</h3>
        <div className="row wrap">
          <Field label="Name" htmlFor="p-name" error={errors.name}><input id="p-name" className="input" style={{ minWidth: 280 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Brand (optional)" htmlFor="p-brand"><input id="p-brand" className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
          <Field label="Tile glyph" htmlFor="p-glyph" hint="Emoji used in the placeholder image"><input id="p-glyph" className="input" style={{ width: 80 }} value={form.imageGlyph} onChange={(e) => setForm({ ...form, imageGlyph: e.target.value })} /></Field>
          <Field label="Tile hue" htmlFor="p-hue"><input id="p-hue" className="input" style={{ width: 90 }} type="number" min={0} max={360} value={form.imageHue} onChange={(e) => setForm({ ...form, imageHue: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Description" htmlFor="p-desc"><textarea id="p-desc" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Categories">
          <div className="row wrap" style={{ gap: 6 }}>
            {(categories.data ?? []).map((c: Category & { productCount?: number }) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${form.categoryIds.includes(c.id) ? 'on' : ''}`}
                aria-pressed={form.categoryIds.includes(c.id)}
                onClick={() => setForm({ ...form, categoryIds: form.categoryIds.includes(c.id) ? form.categoryIds.filter((x) => x !== c.id) : [...form.categoryIds, c.id] })}
              >
                {c.name}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="card card-pad mt-4">
        <div className="row-between">
          <h3 className="mb-0">SKUs</h3>
          <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, skus: [...form.skus, { code: '', packSize: '', priceCents: 0, taxClass: 'GST', active: true }] })}>+ Add SKU</Button>
        </div>
        {form.skus.map((s, i) => (
          <div key={i} className="card card-pad mt-3" style={{ background: 'var(--bg)' }}>
            <div className="row wrap" style={{ alignItems: 'flex-end' }}>
              <Field label="SKU code" error={errors[`sku-${i}-code`]}><input className="input input-sm" style={{ width: 150 }} value={s.code} onChange={(e) => setSku(i, { code: e.target.value.toUpperCase() })} placeholder="ABC-123" /></Field>
              <Field label="Pack size"><input className="input input-sm" style={{ width: 110 }} value={s.packSize ?? ''} onChange={(e) => setSku(i, { packSize: e.target.value })} placeholder="500g" /></Field>
              <Field label="Variant label" hint="e.g. Size:1kg"><input className="input input-sm" style={{ width: 140 }} value={s.optionLabel ?? ''} onChange={(e) => setSku(i, { optionLabel: e.target.value })} /></Field>
              <Field label="Price (cents)" error={errors[`sku-${i}-price`]}><input className="input input-sm" style={{ width: 110 }} type="number" min={0} value={s.priceCents} onChange={(e) => setSku(i, { priceCents: Number(e.target.value) })} /></Field>
              <Field label="Member (cents)"><input className="input input-sm" style={{ width: 110 }} type="number" min={0} value={s.memberPriceCents ?? ''} onChange={(e) => setSku(i, { memberPriceCents: Number(e.target.value) || undefined })} /></Field>
              <Field label="Sale (cents)" error={errors[`sku-${i}-sale`]}><input className="input input-sm" style={{ width: 110 }} type="number" min={0} value={s.salePriceCents ?? ''} onChange={(e) => setSku(i, { salePriceCents: Number(e.target.value) || undefined })} /></Field>
              <Field label="Tax">
                <select className="select input-sm" value={s.taxClass} onChange={(e) => setSku(i, { taxClass: e.target.value as 'GST' | 'GST_FREE' })}>
                  <option value="GST">GST (10%)</option>
                  <option value="GST_FREE">GST-free</option>
                </select>
              </Field>
              {form.skus.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, skus: form.skus.filter((_, idx) => idx !== i) })}>Remove</Button>
              )}
            </div>
          </div>
        ))}
        <p className="xsmall muted">New SKUs start with 0 stock — add inventory after publishing (M1 flow).</p>
      </div>

      <div className="row mt-4">
        <Button loading={save.isPending} onClick={() => { if (validate()) save.mutate(); }}>Save product</Button>
        <Button variant="ghost" onClick={() => navigate('/products')}>Cancel</Button>
        {!isNew && form.status === 'DRAFT' && (
          <Button variant="secondary" onClick={async () => { await api.admin.setProductStatus(id!, 'publish'); qc.invalidateQueries(); navigate('/products'); }}>Save &amp; publish</Button>
        )}
      </div>
    </div>
  );
}

function parseOptionLabel(label?: string): Record<string, string> {
  if (!label) return {};
  const out: Record<string, string> = {};
  for (const pair of label.split('|')) {
    const [k, v] = pair.split(':');
    if (k && v) out[k.trim()] = v.trim();
  }
  return out;
}

export { Modal };

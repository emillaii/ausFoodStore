import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import { Button, ErrorState, Field, Loading, Modal, StatusBadge } from '@aus/ui';
import type { Category } from '@aus/contracts';

type CatRow = Category & { productCount: number };

export default function Categories() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<CatRow[], ApiClientError>({ queryKey: ['admin-categories'], queryFn: () => api.admin.categories() });
  const [editing, setEditing] = useState<CatRow | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/admin/categories/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); setMessage('Category deleted.'); },
    onError: (e) => setMessage((e as ApiClientError).message),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  const rows = data ?? [];
  const nameOf = (id: string | null) => rows.find((c) => c.id === id)?.name ?? '—';

  return (
    <div>
      <div className="page-head">
        <h1>Categories</h1>
        <Button onClick={() => setEditing('new')}>+ New category</Button>
      </div>
      {message && <p className="small" role="status" style={{ color: 'var(--success-700)' }}>{message}</p>}
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        columns={[
          { key: 'name', header: 'Name', sortValue: (c) => c.name, render: (c) => (
            <span><span aria-hidden="true">{c.imageGlyph} </span><strong>{c.name}</strong>{c.parentId && <span className="muted small"> (in {nameOf(c.parentId)})</span>}</span>
          ) },
          { key: 'slug', header: 'Slug', render: (c) => <span className="kbd">{c.slug}</span> },
          { key: 'order', header: 'Display order', numeric: true, sortValue: (c) => c.displayOrder, render: (c) => c.displayOrder },
          { key: 'products', header: 'Products', numeric: true, render: (c) => c.productCount },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.active ? 'ACTIVE' : 'ARCHIVED'} /> },
          { key: 'actions', header: '', render: (c) => (
            <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(c.id)}>Delete</Button>
            </span>
          ) },
        ]}
        empty="No categories yet."
      />
      <CategoryModal editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CategoryModal({ editing, onClose }: { editing: CatRow | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<CatRow[], ApiClientError>({ queryKey: ['admin-categories'], queryFn: () => api.admin.categories(), enabled: editing != null });
  const isNew = editing === 'new';
  const cat = isNew ? null : editing;
  const [form, setForm] = useState(() => ({
    name: cat?.name ?? '', parentId: cat?.parentId ?? '', displayOrder: cat?.displayOrder ?? 99,
    active: cat?.active ?? true, imageGlyph: cat?.imageGlyph ?? '🏷️',
  }));
  const [key, setKey] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // reset form when target changes
  const targetKey = `${cat?.id ?? 'new'}`;
  if (key !== targetKey) {
    setKey(targetKey);
    setForm({ name: cat?.name ?? '', parentId: cat?.parentId ?? '', displayOrder: cat?.displayOrder ?? 99, active: cat?.active ?? true, imageGlyph: cat?.imageGlyph ?? '🏷️' });
    setErrors({});
  }

  const save = async () => {
    if (!form.name.trim()) return setErrors({ name: 'Name is required.' });
    setBusy(true);
    try {
      const body = { ...form, parentId: form.parentId || null };
      if (cat) await api.admin.updateCategory(cat.id, body);
      else await api.admin.saveCategory(body);
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      onClose();
    } catch (e) {
      setErrors({ form: (e as ApiClientError).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={editing != null} onClose={onClose} title={cat ? `Edit — ${cat.name}` : 'New category'}>
      {errors.form && <p className="field-error" role="alert">{errors.form}</p>}
      <Field label="Name" htmlFor="c-name" error={errors.name}><input id="c-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Parent category" htmlFor="c-parent" hint="Leave empty for a top-level category">
        <select id="c-parent" className="select" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
          <option value="">— Top level —</option>
          {(data ?? []).filter((c) => c.id !== cat?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="row">
        <Field label="Display order" htmlFor="c-order"><input id="c-order" className="input" type="number" min={0} value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} /></Field>
        <Field label="Tile glyph" htmlFor="c-glyph"><input id="c-glyph" className="input" style={{ width: 80 }} value={form.imageGlyph} onChange={(e) => setForm({ ...form, imageGlyph: e.target.value })} /></Field>
      </div>
      <label className="row small" style={{ minHeight: 40 }}>
        <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active (visible in storefront)
      </label>
      <Button block loading={busy} onClick={save}>{cat ? 'Save changes' : 'Create category'}</Button>
    </Modal>
  );
}

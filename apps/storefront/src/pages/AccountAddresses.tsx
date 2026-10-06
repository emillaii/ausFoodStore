import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { Button, ErrorState, Field, Loading, Modal } from '@aus/ui';
import type { Address } from '@aus/contracts';

export default function AccountAddresses() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<Address[], ApiClientError>({ queryKey: ['addresses'], queryFn: () => api.addresses() });
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAddress(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['addresses'] }); setMessage('Address deleted.'); },
    onError: (e) => setMessage((e as ApiClientError).message),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="row-between">
        <h1 className="mb-0">Saved addresses</h1>
        <Button onClick={() => setEditing('new')}>Add address</Button>
      </div>
      {message && <p className="small mt-2" role="status">{message}</p>}
      <div className="stack mt-4">
        {(data ?? []).length === 0 && <p className="muted">No saved addresses yet — add one to speed up checkout.</p>}
        {(data ?? []).map((a) => (
          <div className="card card-pad" key={a.id}>
            <div className="row-between wrap">
              <div>
                <strong>{a.name}</strong>
                {a.isDefaultShipping && <> <span className="badge badge-info">Default delivery</span></>}
                {a.isDefaultBilling && <> <span className="badge badge-neutral">Default billing</span></>}
                <div className="small muted">
                  {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.suburb} {a.state} {a.postcode} · {a.phone}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)}>Delete</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <AddressModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(msg) => { setEditing(null); setMessage(msg); }}
      />
    </div>
  );
}

function AddressModal({ editing, onClose, onSaved }: { editing: Address | 'new' | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const qc = useQueryClient();
  const isNew = editing === 'new';
  const address = isNew ? null : editing;
  const [form, setForm] = useState(() => address ?? { id: '', name: '', phone: '', line1: '', line2: '', suburb: '', state: 'NSW', postcode: '', country: 'AU' as const, isDefaultShipping: false, isDefaultBilling: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<Address>) => setForm({ ...form, ...patch });

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!form.name) errs.name = 'Name is required.';
    if (!form.line1) errs.line1 = 'Street address is required.';
    if (!form.suburb) errs.suburb = 'Suburb is required.';
    if (!/^\d{4}$/.test(form.postcode)) errs.postcode = 'Enter a 4-digit postcode.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    try {
      const body = { ...form };
      if (address) await api.updateAddress(address.id, body);
      else await api.createAddress(body);
      qc.invalidateQueries({ queryKey: ['addresses'] });
      onSaved(address ? 'Address updated.' : 'Address added.');
    } catch (e) {
      setErrors({ form: (e as ApiClientError).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={editing != null} onClose={onClose} title={address ? 'Edit address' : 'Add address'}>
      {errors.form && <p className="field-error" role="alert">{errors.form}</p>}
      <Field label="Name" htmlFor="a-name" error={errors.name}><input id="a-name" className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Phone" htmlFor="a-phone"><input id="a-phone" className="input" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
      <Field label="Street address" htmlFor="a-line1" error={errors.line1}><input id="a-line1" className="input" value={form.line1} onChange={(e) => set({ line1: e.target.value })} /></Field>
      <Field label="Unit / apartment (optional)" htmlFor="a-line2"><input id="a-line2" className="input" value={form.line2 ?? ''} onChange={(e) => set({ line2: e.target.value })} /></Field>
      <div className="row">
        <Field label="Suburb" htmlFor="a-suburb" error={errors.suburb}><input id="a-suburb" className="input" value={form.suburb} onChange={(e) => set({ suburb: e.target.value })} /></Field>
        <Field label="State" htmlFor="a-state">
          <select id="a-state" className="select" value={form.state} onChange={(e) => set({ state: e.target.value })}>
            {['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Postcode" htmlFor="a-post" error={errors.postcode}><input id="a-post" className="input" inputMode="numeric" maxLength={4} value={form.postcode} onChange={(e) => set({ postcode: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <label className="row small" style={{ minHeight: 40 }}>
        <input type="checkbox" checked={form.isDefaultShipping} onChange={(e) => set({ isDefaultShipping: e.target.checked })} /> Default delivery address
      </label>
      <label className="row small" style={{ minHeight: 40 }}>
        <input type="checkbox" checked={form.isDefaultBilling} onChange={(e) => set({ isDefaultBilling: e.target.checked })} /> Default billing address
      </label>
      <Button block loading={busy} onClick={save}>Save address</Button>
    </Modal>
  );
}

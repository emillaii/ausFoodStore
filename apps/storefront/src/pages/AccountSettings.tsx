import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, ErrorState, Field } from '@aus/ui';

export default function AccountSettings() {
  const { customer, refresh } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', marketing: false, analytics: false });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (customer) {
      const latest = customer.consentHistory[0];
      setForm({
        firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone ?? '',
        marketing: latest?.marketing ?? false, analytics: latest?.analytics ?? false,
      });
    }
  }, [customer]);

  const save = useMutation({
    mutationFn: () => api.updateProfile({
      firstName: form.firstName, lastName: form.lastName, phone: form.phone,
      consent: { marketing: form.marketing, analytics: form.analytics },
    }),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries();
      setMessage('Saved. Consent change recorded with a timestamp.');
    },
    onError: (e) => setError((e as ApiClientError).message),
  });

  const requestDeletion = useMutation({
    mutationFn: () => api.requestDeletion(),
    onSuccess: () => { setMessage('Deletion request recorded — staff review required (demo workflow).'); setConfirmDelete(false); refresh(); },
    onError: (e) => setError((e as ApiClientError).message),
  });

  if (!customer) return <ErrorState error="Sign in required." />;
  if (customer.state === 'DELETION_REQUESTED') {
    return (
      <div className="card card-pad" role="status">
        <h1>Account settings</h1>
        <p><strong>Deletion request pending.</strong> Staff will review your request. Retained financial records follow the approved retention policy (sample content — see Privacy policy).</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h1>Account settings</h1>
      {message && <div className="card card-pad small mt-2" role="status" style={{ background: 'var(--success-100)', borderColor: 'var(--success-700)' }}>{message}</div>}
      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="card card-pad mt-4">
        <h3>Contact details</h3>
        <p className="small muted">Email <strong>{customer.email}</strong> — demo accounts can't change email.</p>
        <Field label="First name" htmlFor="st-first"><input id="st-first" className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="Last name" htmlFor="st-last"><input id="st-last" className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Phone" htmlFor="st-phone"><input id="st-phone" className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Button loading={save.isPending} onClick={() => { setError(null); setMessage(null); save.mutate(); }}>Save changes</Button>
      </div>

      <div className="card card-pad mt-4">
        <h3>Consent preferences</h3>
        <label className="row small" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={form.marketing} onChange={(e) => setForm({ ...form, marketing: e.target.checked })} />
          Email me special offers and campaigns
        </label>
        <label className="row small" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={form.analytics} onChange={(e) => setForm({ ...form, analytics: e.target.checked })} />
          Allow anonymous usage analytics (no personal data)
        </label>
      </div>

      <div className="card card-pad mt-4" style={{ borderColor: 'var(--danger-600)' }}>
        <h3>Account deletion</h3>
        <p className="small muted">Requests a staff-reviewed deletion workflow. Financial records may be retained per policy.</p>
        {confirmDelete ? (
          <div className="row wrap">
            <Button variant="danger" loading={requestDeletion.isPending} onClick={() => requestDeletion.mutate()}>Confirm deletion request</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmDelete(true)}>Request account deletion</Button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import { useStaff } from '../lib/staff';
import { Button, ErrorState, Field, Loading, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { PermissionMatrix, Role, StoreSettings, StaffUser } from '@aus/contracts';

interface SettingsData {
  settings: StoreSettings;
  staff: StaffUser[];
  roleLabels: Record<Role, string>;
  permissionMatrix: Record<Role, PermissionMatrix>;
}

export default function Settings() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<SettingsData, ApiClientError>({ queryKey: ['admin-settings'], queryFn: () => api.admin.settings() });
  const [form, setForm] = useState<StoreSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (data && !form) setForm(structuredClone(data.settings)); }, [data, form]);

  const save = useMutation({
    mutationFn: () => api.admin.updateSettings({
      storeName: form!.storeName, tagline: form!.tagline,
      shippingFlatCents: form!.shippingFlatCents, freeShippingThresholdCents: form!.freeShippingThresholdCents,
      excludedPostcodes: form!.excludedPostcodes, timezone: form!.timezone,
      featureFlags: form!.featureFlags, policyPages: form!.policyPages,
    }),
    onSuccess: () => { setMessage('Settings saved.'); qc.invalidateQueries({ queryKey: ['admin-settings'] }); },
    onError: (e) => setErr((e as ApiClientError).message),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.admin.updateStaff(id, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }),
    onError: (e) => setErr((e as ApiClientError).message),
  });

  const audit = useQuery({ queryKey: ['admin-audit'], queryFn: () => api.admin.audit() });

  if (isLoading || !form || !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  const s = form;
  const set = (patch: Partial<StoreSettings>) => { setForm({ ...s, ...patch }); setMessage(null); };

  return (
    <div>
      <div className="page-head"><h1>Settings</h1></div>
      {message && <p className="small" role="status" style={{ color: 'var(--success-700)' }}>{message}</p>}
      {err && <p className="field-error" role="alert">{err}</p>}

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
        <div className="card card-pad">
          <h3>Store identity</h3>
          <Field label="Store name" htmlFor="st-name"><input id="st-name" className="input" value={s.storeName} onChange={(e) => set({ storeName: e.target.value })} /></Field>
          <Field label="Tagline" htmlFor="st-tag"><input id="st-tag" className="input" value={s.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
          <Field label="Reporting timezone" htmlFor="st-tz" hint="Demo default: Australia/Sydney"><input id="st-tz" className="input" value={s.timezone} onChange={(e) => set({ timezone: e.target.value })} /></Field>
        </div>

        <div className="card card-pad">
          <h3>Delivery configuration <span className="badge badge-warn">sample values</span></h3>
          <div className="row">
            <Field label="Flat rate (cents)" htmlFor="st-flat"><input id="st-flat" className="input" type="number" min={0} value={s.shippingFlatCents} onChange={(e) => set({ shippingFlatCents: Number(e.target.value) })} /> </Field>
            <Field label="Free threshold (cents)" htmlFor="st-free"><input id="st-free" className="input" type="number" min={0} value={s.freeShippingThresholdCents} onChange={(e) => set({ freeShippingThresholdCents: Number(e.target.value) })} /></Field>
          </div>
          <p className="small muted mb-0">Flat {formatAud(s.shippingFlatCents)} · free over {formatAud(s.freeShippingThresholdCents)}</p>
          <Field label="Excluded postcodes (comma separated)" htmlFor="st-exc">
            <input id="st-exc" className="input" value={s.excludedPostcodes.join(', ')} onChange={(e) => set({ excludedPostcodes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          </Field>
          <label className="row small" style={{ minHeight: 40 }}>
            <input type="checkbox" checked={!!s.featureFlags.clickAndCollect} onChange={(e) => set({ featureFlags: { ...s.featureFlags, clickAndCollect: e.target.checked } })} />
            Click &amp; collect (feature flag — off by default per brief)
          </label>
        </div>

        <div className="card card-pad">
          <h3>Loyalty rules (sample, read-only here)</h3>
          <p className="small mb-0">
            {s.coinsPerDollar} coin per AUD 1 earned · {s.coinsPerDollarValue} coins = $1 · redemption step {s.coinRedemptionStep} ·
            earned coins pending until full shipment. Changing these requires a retailer-approved policy — edit in code/config for the prototype.
          </p>
        </div>

        <div className="card card-pad">
          <h3>Staff roles</h3>
          <table className="tbl">
            <tbody>
              {data.staff.map((st) => (
                <tr key={st.id}>
                  <td><strong>{st.name}</strong><div className="xsmall muted">{st.email}</div></td>
                  <td>
                    <select
                      className="select input-sm" value={st.role} aria-label={`Role for ${st.name}`}
                      onChange={(e) => changeRole.mutate({ id: st.id, role: e.target.value as Role })}
                    >
                      {Object.keys(data.permissionMatrix).map((r) => <option key={r} value={r}>{data.roleLabels[r as Role]}</option>)}
                    </select>
                  </td>
                  <td><StatusBadge status={st.active ? 'ACTIVE' : 'DRAFT'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="xsmall muted mb-0">Role changes are audited. Production permissions come from the API per request — never from this UI.</p>
        </div>

        <div className="card card-pad">
          <h3>Permission matrix</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Capability</th>{Object.keys(data.permissionMatrix).map((r) => <th key={r} className="xsmall">{r.replace('_', ' ')}</th>)}</tr></thead>
              <tbody>
                {(Object.keys(data.permissionMatrix.ADMIN) as (keyof PermissionMatrix)[]).map((cap) => (
                  <tr key={cap}>
                    <td className="xsmall">{cap}</td>
                    {Object.entries(data.permissionMatrix).map(([r, matrix]) => (
                      <td key={r} className="num">{matrix[cap] ? '✓' : '·'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <h3>Policy content (editable)</h3>
          {s.policyPages.map((p, i) => (
            <details key={p.slug} className="mt-2">
              <summary className="small" style={{ cursor: 'pointer' }}><strong>{p.title}</strong> <span className="kbd">{p.slug}</span></summary>
              <Field label="Body" htmlFor={`pol-${i}`}>
                <textarea id={`pol-${i}`} className="textarea" style={{ minHeight: 140 }} value={p.body} onChange={(e) => set({ policyPages: s.policyPages.map((x, idx) => (idx === i ? { ...x, body: e.target.value } : x)) })} />
              </Field>
            </details>
          ))}
        </div>

        <div className="card card-pad">
          <h3>Integration status</h3>
          <table className="tbl">
            <tbody>
              {[
                ['Authentication', 'SIMULATED (demo identities)', 'warn'],
                ['Payments', 'SIMULATED outcomes (success/decline/pending)', 'warn'],
                ['Documents', 'Printable previews marked Demo', 'warn'],
                ['Notifications', 'Mock event history — no email sent', 'warn'],
                ['Database', 'Local JSON store (single authoritative mock)', 'warn'],
                ['AWS/Firebase', 'Not connected — Phase 2', 'neutral'],
              ].map(([k, v, tone]) => (
                <tr key={k}><td><strong>{k}</strong></td><td><StatusBadge status={tone === 'warn' ? 'PENDING' : 'DRAFT'} /> <span className="small muted">{v}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <Button loading={save.isPending} onClick={() => { setErr(null); save.mutate(); }}>Save settings</Button>
      </div>

      <h2 className="mt-6">Audit log (recent)</h2>
      {audit.isLoading && <Loading />}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Summary</th></tr></thead>
          <tbody>
            {(audit.data ?? []).slice(0, 40).map((a: { id: string; createdAt: string; actor: string; actorRole?: string; action: string; resource: string; summary: string }) => (
              <tr key={a.id}>
                <td className="xsmall">{new Date(a.createdAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="xsmall">{a.actor}{a.actorRole ? ` (${a.actorRole})` : ''}</td>
                <td className="xsmall"><strong>{a.action}</strong></td>
                <td className="xsmall muted">{a.resource}</td>
                <td className="xsmall">{a.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

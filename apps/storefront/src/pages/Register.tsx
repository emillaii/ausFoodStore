import { useState } from 'react';
import type { ApiClientError } from '@aus/commerce-client';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button, Field } from '@aus/ui';

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/account';
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', marketing: true, analytics: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return setError('Enter a valid email address.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      await signUp(form);
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <h1>Create account</h1>
      <p className="muted small">Demo authentication — production uses Firebase. Your cart will be merged automatically.</p>
      <form onSubmit={submit} noValidate>
        <div className="row">
          <Field label="First name" htmlFor="rg-first"><input id="rg-first" className="input" value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} required autoComplete="given-name" /></Field>
          <Field label="Last name" htmlFor="rg-last"><input id="rg-last" className="input" value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} required autoComplete="family-name" /></Field>
        </div>
        <Field label="Email" htmlFor="rg-email"><input id="rg-email" className="input" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} required autoComplete="email" /></Field>
        <Field label="Phone (optional)" htmlFor="rg-phone"><input id="rg-phone" className="input" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" /></Field>
        <Field label="Password" htmlFor="rg-pass" hint="At least 8 characters" error={error ?? undefined}>
          <input id="rg-pass" className="input" type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} required autoComplete="new-password" minLength={8} />
        </Field>
        <label className="row small" style={{ minHeight: 40 }}>
          <input type="checkbox" checked={form.marketing} onChange={(e) => set({ marketing: e.target.checked })} />
          Email me special offers (consent recorded, can change later)
        </label>
        <label className="row small" style={{ minHeight: 40 }}>
          <input type="checkbox" checked={form.analytics} onChange={(e) => set({ analytics: e.target.checked })} />
          Allow anonymous usage analytics (optional)
        </label>
        <Button block type="submit" loading={busy} className="mt-2">Create account</Button>
      </form>
      <p className="mt-4">Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
    </div>
  );
}

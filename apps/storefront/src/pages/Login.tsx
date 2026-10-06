import { useState } from 'react';
import type { ApiClientError } from '@aus/commerce-client';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button, Field } from '@aus/ui';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/account';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Sign in</h1>
      <p className="muted small">Demo accounts: <span className="kbd">ava@example.com</span> (member) or <span className="kbd">liam@example.com</span> — password <span className="kbd">demo1234</span>.</p>
      <form onSubmit={submit} noValidate>
        <Field label="Email" htmlFor="li-email" error={error ?? undefined}>
          <input id="li-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="li-pass">
          <input id="li-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button block type="submit" loading={busy}>Sign in</Button>
      </form>
      <div className="row mt-4" style={{ justifyContent: 'space-between' }}>
        <Link to={`/register${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
    </div>
  );
}

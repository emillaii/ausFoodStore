import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field } from '@aus/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Reset password</h1>
      {sent ? (
        <div className="card card-pad" role="status">
          <p className="mb-0">📧 <strong>Demo environment:</strong> a real password-reset email is not sent in this prototype.
            Use one of the seeded demo accounts (password <span className="kbd">demo1234</span>) or register a new account.</p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} noValidate>
          <Field label="Email" htmlFor="fp-email" hint="Demo only — no email is actually sent.">
            <input id="fp-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button block type="submit">Send reset link (simulated)</Button>
        </form>
      )}
      <p className="mt-4"><Link to="/login">Back to sign in</Link></p>
    </div>
  );
}

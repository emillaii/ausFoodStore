import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { PermissionMatrix } from '@aus/contracts';
import { ROLE_LABELS, useStaff } from '../lib/staff';
import { api } from '../lib/api';
import { Button, Modal } from '@aus/ui';

const NAV: { to: string; label: string; icon: string; perm: keyof PermissionMatrix }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', perm: 'orders' },
  { to: '/products', label: 'Products', icon: '📦', perm: 'products' },
  { to: '/categories', label: 'Categories', icon: '🗂️', perm: 'categories' },
  { to: '/inventory', label: 'Inventory', icon: '🏷️', perm: 'orders' },
  { to: '/orders', label: 'Orders', icon: '🧾', perm: 'orders' },
  { to: '/fulfilment', label: 'Fulfilment', icon: '📋', perm: 'fulfilment' },
  { to: '/customers', label: 'Customers', icon: '👥', perm: 'customers' },
  { to: '/returns', label: 'Returns & Refunds', icon: '↩️', perm: 'returns' },
  { to: '/documents', label: 'Documents', icon: '📄', perm: 'documents' },
  { to: '/promotions', label: 'Promotions', icon: '🏷️', perm: 'promotions' },
  { to: '/loyalty', label: 'Loyalty', icon: '🪙', perm: 'customers' },
  { to: '/reports', label: 'Reports', icon: '📈', perm: 'reports' },
  { to: '/settings', label: 'Settings', icon: '⚙️', perm: 'settings' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { staff, permissions, staffList, setRole, can } = useStaff();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const crumbs = location.pathname.split('/').filter(Boolean)
    .filter((c) => !/^(ord|prod|sku|cat)-/.test(c));
  const visibleNav = NAV.filter((n) => permissions == null || can(n.perm));

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Admin navigation">
        <Link to="/dashboard" className="brand"><span className="mark" aria-hidden="true">🥩</span> Aus Meat Co.</Link>
        <nav>
          <div className="nav-section">Operations</div>
          {visibleNav.slice(0, 9).map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setMenuOpen(false)}>
              <span aria-hidden="true">{n.icon}</span> {n.label}
            </NavLink>
          ))}
          <div className="nav-section">Growth &amp; config</div>
          {visibleNav.slice(9).map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setMenuOpen(false)}>
              <span aria-hidden="true">{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 12, marginTop: 'auto' }}>
          <Button size="sm" variant="secondary" block onClick={() => setScenariosOpen(true)}>Demo scenarios</Button>
          <Button size="sm" variant="ghost" block className="mt-2" onClick={() => setResetOpen(true)}>Reset demo data</Button>
        </div>
      </aside>

      <div>
        <header className="topbar">
          <div className="topbar-inner">
            <button className="icon-btn hamburger" aria-label="Toggle menu" onClick={() => setMenuOpen((v) => !v)}>☰</button>
            <nav className="breadcrumbs grow" aria-label="Breadcrumb">
              <Link to="/dashboard">Admin</Link>
              {crumbs.slice(0, -1).map((c) => <> › <span>{c}</span></>)}
              {crumbs.length > 0 && <> › <strong>{crumbs[crumbs.length - 1]}</strong></>}
            </nav>
            <span className="env-chip">Demo env</span>
            <label className="sr-only" htmlFor="role-switch">Acting staff member</label>
            <select
              id="role-switch" className="select role-select" value={staff?.id ?? ''}
              onChange={(e) => setRole(e.target.value)}
              title="Demo role switcher — production permissions come from the API"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {ROLE_LABELS[s.role]}</option>
              ))}
            </select>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset demo data?" small>
        <p className="small">This restores the seeded demo dataset (products, orders, stock, loyalty). Any changes made in this session are lost. Both apps see the reset immediately.</p>
        {resetMsg && <p className="small" role="status" style={{ color: 'var(--success-700)' }}>{resetMsg}</p>}
        <div className="row">
          <Button
            className="grow"
            onClick={async () => {
              await api.demo.reset();
              setResetMsg('Store reset — reloading…');
              setTimeout(() => window.location.reload(), 600);
            }}
          >
            Reset now
          </Button>
          <Button variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Button>
        </div>
      </Modal>

      <Modal open={scenariosOpen} onClose={() => setScenariosOpen(false)} title="Demo scenarios">
        <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li><strong>Publish → stock → buy:</strong> create a product here, publish it, add stock in Inventory — it appears in the storefront (localhost:5173).</li>
          <li><strong>Order lifecycle:</strong> buy something in the storefront, then pick/pack/dispatch it here under Fulfilment.</li>
          <li><strong>Final unit:</strong> White Truffle Oil has 1 unit, held by Noah's pending checkout — a second checkout attempt fails.</li>
          <li><strong>Expiry:</strong> ATT-MIA-EXPIRED shows released stock and coin holds.</li>
          <li><strong>Payment outcomes:</strong> at the storefront payment step, simulate success/decline/pending.</li>
          <li><strong>Duplicate events:</strong> replaying pay/dispatch has no double effect (idempotent).</li>
          <li><strong>Partial shipment:</strong> ORD-1002; <strong>pending refund:</strong> its return request.</li>
          <li><strong>Damaged return:</strong> ORD-1005 — no saleable stock change.</li>
          <li><strong>Permissions:</strong> switch roles above; unauthorised areas show a denied screen.</li>
        </ol>
        <p className="xsmall muted mb-0">Try to sign in as Ava (ava@example.com / demo1234) in the storefront for the richest order history.</p>
      </Modal>
    </div>
  );
}

export function Denied({ permission }: { permission: string }) {
  const { staff } = useStaff();
  return (
    <div className="denied card card-pad" role="alert">
      <div style={{ fontSize: 40 }} aria-hidden="true">🔒</div>
      <h1>Permission denied</h1>
      <p className="muted">
        {staff ? `${staff.name} (${ROLE_LABELS[staff.role]})` : 'Your role'} does not have <strong>{permission}</strong> permission.
        In production this is enforced by the API on every request — the demo role switcher only changes which staff identity you're acting as.
      </p>
      <Link className="btn btn-secondary" to="/dashboard">Back to dashboard</Link>
    </div>
  );
}

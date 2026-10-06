import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth, useCartCount, useRecentSearches } from '../lib/auth';
import { formatAud } from '@aus/contracts';

export function Header() {
  const { customer } = useAuth();
  const cartCount = useCartCount();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [recent, addRecent, clearRecent] = useRecentSearches();
  const boxRef = useRef<HTMLDivElement>(null);

  const suggestions = useQuery({
    queryKey: ['suggest', q],
    queryFn: () => api.suggestions(q),
    enabled: open && q.trim().length >= 2,
    staleTime: 15_000,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submit = (e?: React.FormEvent, query?: string) => {
    e?.preventDefault();
    const term = (query ?? q).trim();
    if (!term) return;
    addRecent(term);
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <header className="header">
      <div className="demo-banner">Demo environment — simulated payments &amp; data</div>
      <div className="header-inner">
        <Link to="/" className="logo" aria-label="Aus Food Store home"><span className="mark" aria-hidden="true">🥩</span><span className="hide-sm">Aus Meat Co.</span></Link>
        <div ref={boxRef} className="search-form">
          <form onSubmit={submit} role="search">
            <label className="sr-only" htmlFor="site-search">Search products</label>
            <input
              id="site-search" className="search-input" type="search" placeholder="Search prime cuts, sausages, more…"
              value={q} autoComplete="off"
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
            />
            <button className="search-btn" aria-label="Search">🔍</button>
          </form>
          {open && (q.trim().length >= 2 ? (suggestions.data && (suggestions.data.products.length > 0 || suggestions.data.categories.length > 0)) : recent.length > 0) && (
            <div className="suggest" role="listbox" aria-label="Search suggestions">
              {q.trim().length < 2 && recent.length > 0 && (
                <>
                  <div className="row-between xsmall muted" style={{ padding: '6px 14px' }}>
                    <span>Recent searches</span>
                    <button className="btn-ghost btn" style={{ minHeight: 28 }} onClick={clearRecent}>Clear</button>
                  </div>
                  {recent.map((r) => (
                    <button key={r} className="suggest-item" onClick={() => submit(undefined, r)}>🕘 {r}</button>
                  ))}
                </>
              )}
              {q.trim().length >= 2 && suggestions.data?.categories.map((c) => (
                <button key={c.slug} className="suggest-item" onClick={() => { setOpen(false); navigate(`/categories/${c.slug}`); }}>
                  🗂️ <span><strong>{c.name}</strong> <span className="muted">— category</span></span>
                </button>
              ))}
              {q.trim().length >= 2 && suggestions.data?.products.map((p) => (
                <button key={p.slug} className="suggest-item" onClick={() => { setOpen(false); navigate(`/products/${p.slug}`); }}>
                  <span aria-hidden="true">{p.glyph}</span>
                  <span>{p.name}{p.brand ? <span className="muted"> · {p.brand}</span> : null}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <nav className="header-links" aria-label="Account">
          {customer ? (
            <>
              <CoinChip />
              <Link to="/account">Hi, {customer.firstName}</Link>
            </>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
          <Link to="/cart" className="icon-btn" aria-label={`Cart, ${cartCount} items`}>
            🛒{cartCount > 0 && <span className="cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>}
          </Link>
        </nav>
        <Link to="/cart" className="icon-btn hide-desktop" aria-label={`Cart, ${cartCount} items`}>
          🛒{cartCount > 0 && <span className="cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>}
        </Link>
      </div>
      <CategoriesBar />
    </header>
  );
}

function CoinChip() {
  const { data } = useQuery({
    queryKey: ['loyalty'],
    queryFn: () => api.loyalty(),
    staleTime: 30_000,
  });
  return <Link to="/account/loyalty" title="Loyalty coins">🪙 {data?.balance.available ?? 0}</Link>;
}

function CategoriesBar() {
  const { data } = useQuery({ queryKey: ['categories'], queryFn: () => api.categories(), staleTime: 300_000 });
  const top = (data ?? []).filter((c) => c.parentId === null);
  return (
    <nav className="header-links" aria-label="Categories" style={{ padding: '0 16px 8px', maxWidth: 1200, margin: '0 auto' }}>
      {top.map((c) => (
        <Link key={c.id} to={`/categories/${c.slug}`}>{c.name}</Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const cartCount = useCartCount();
  const { customer } = useAuth();
  const item = (to: string, icon: string, label: string, badge?: number) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
      <span className="ico" aria-hidden="true">
        {icon}
        {badge ? <span className="cart-badge">{badge > 99 ? '99+' : badge}</span> : null}
      </span>
      {label}
    </NavLink>
  );
  return (
    <nav className="bottomnav" aria-label="Primary">
      {item('/', '🏠', 'Home')}
      {item('/categories', '🗂️', 'Categories')}
      {item('/search', '🔍', 'Search')}
      {item('/cart', '🛒', 'Cart', cartCount)}
      {item(customer ? '/account' : '/login', '👤', customer ? 'Account' : 'Sign in')}
    </nav>
  );
}

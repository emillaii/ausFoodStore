import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken, setToken, getSessionKey } from './api';
import type { CustomerPublic } from '@aus/contracts';

interface AuthCtx {
  customer: CustomerPublic | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (body: { email: string; password: string; firstName: string; lastName: string; phone?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => void;
}

const Ctx = createContext<AuthCtx>(null as never);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<CustomerPublic | null> => (getToken() ? await api.me().catch(() => null) : null),
    staleTime: 60_000,
  });

  const customer = meQuery.data ?? null;

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.token);
    await api.mergeCart();
    qc.invalidateQueries();
  }, [qc]);

  const signUp = useCallback(async (body: { email: string; password: string; firstName: string; lastName: string; phone?: string }) => {
    const res = await api.register(body);
    setToken(res.token);
    await api.mergeCart();
    qc.invalidateQueries();
  }, [qc]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setToken(null);
    qc.clear();
  }, [qc]);

  const value = useMemo<AuthCtx>(() => ({
    customer,
    loading: meQuery.isLoading,
    signIn, signUp, signOut,
    refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
  }), [customer, meQuery.isLoading, signIn, signUp, signOut, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}

export function useCartCount(): number {
  const { data } = useQuery({
    queryKey: ['cart'],
    queryFn: () => api.cart(),
    staleTime: 10_000,
  });
  return data?.itemCount ?? 0;
}

export function useRecentSearches(): [string[], (q: string) => void, () => void] {
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('afs_recent_searches') ?? '[]'); } catch { return []; }
  });
  const add = useCallback((q: string) => {
    setRecent((prev) => {
      const next = [q, ...prev.filter((x) => x !== q)].slice(0, 6);
      localStorage.setItem('afs_recent_searches', JSON.stringify(next));
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    setRecent([]);
    localStorage.removeItem('afs_recent_searches');
  }, []);
  return [recent, add, clear];
}

/** Keep the guest session key warm (also used pre-login for cart continuity). */
export function useSessionWarm(): void {
  useEffect(() => { getSessionKey(); }, []);
}

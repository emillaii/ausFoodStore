import { createClient } from '@aus/commerce-client';

export const TOKEN_KEY = 'afs_token';
export const SESSION_KEY = 'afs_session';
export const RECENT_SEARCHES_KEY = 'afs_recent_searches';

export function getSessionKey(): string {
  let key = localStorage.getItem(SESSION_KEY);
  if (!key) {
    key = `s-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(SESSION_KEY, key);
  }
  return key;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const api = createClient({
  baseUrl: '/api',
  getHeaders: () => {
    const headers: Record<string, string> = { 'x-session-key': getSessionKey() };
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
  },
});

import { createClient } from '@aus/commerce-client';

export const STAFF_KEY = 'afs_staff_id';

export function getStaffId(): string | null {
  return localStorage.getItem(STAFF_KEY);
}

export function setStaffId(id: string | null): void {
  if (id) localStorage.setItem(STAFF_KEY, id);
  else localStorage.removeItem(STAFF_KEY);
}

export const api = createClient({
  baseUrl: '/api',
  getHeaders: () => {
    const headers: Record<string, string> = {};
    const staff = getStaffId();
    if (staff) headers['x-staff-id'] = staff;
    return headers;
  },
});

import type { Request, Response } from 'express';
import type { ApiErrorCode, Customer, PermissionMatrix, StaffUser } from '@aus/contracts';
import { PERMISSION_MATRIX } from '@aus/contracts';
import { db } from './db';

export class ApiFail extends Error {
  constructor(public status: number, public code: ApiErrorCode, message: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

export function fail(status: number, code: ApiErrorCode, message: string, details?: Record<string, unknown>): never {
  throw new ApiFail(status, code, message, details);
}

export function rid(res: Response): string {
  return String(res.locals.rid ?? 'req');
}

export function ok(res: Response, data: unknown): void {
  res.json({ data, requestId: rid(res) });
}

export interface Auth {
  sessionKey?: string;
  customer?: Customer;
  staff?: StaffUser;
}

export function getAuth(req: Request): Auth {
  const auth: Auth = {};
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    const session = db.sessions.find((s) => s.token === token);
    if (session) auth.customer = db.customers.find((c) => c.id === session.customerId);
  }
  const sessionKey = req.header('x-session-key');
  if (sessionKey) auth.sessionKey = sessionKey;
  const staffId = req.header('x-staff-id');
  if (staffId) auth.staff = db.staff.find((s) => s.id === staffId && s.active);
  return auth;
}

/** Resolve the cart owner: signed-in customer first, else the browser session key. */
export function ownerKeyOf(auth: Auth): string {
  if (auth.customer) return auth.customer.id;
  if (auth.sessionKey) return `guest:${auth.sessionKey}`;
  fail(401, 'UNAUTHENTICATED', 'No cart session — send X-Session-Key or a customer bearer token.');
}

export function requireCustomer(auth: Auth): Customer {
  if (!auth.customer) fail(401, 'UNAUTHENTICATED', 'Sign in required.');
  if (auth.customer.state === 'SUSPENDED') fail(403, 'FORBIDDEN', 'Account suspended.');
  return auth.customer;
}

export function requireStaff(auth: Auth, perm: keyof PermissionMatrix): StaffUser {
  if (!auth.staff) fail(401, 'UNAUTHENTICATED', 'Staff identity required (X-Staff-Id).');
  const allowed = PERMISSION_MATRIX[auth.staff.role]?.[perm];
  if (!allowed) fail(403, 'FORBIDDEN', `Role ${auth.staff.role} is not permitted to ${perm}.`);
  return auth.staff;
}

export const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const nowIso = (): string => new Date().toISOString();

export function str(v: unknown, field: string, opts: { optional?: boolean; max?: number } = {}): string | undefined {
  if (v == null || v === '') {
    if (opts.optional) return undefined;
    fail(422, 'VALIDATION', `${field} is required.`);
  }
  if (typeof v !== 'string') fail(422, 'VALIDATION', `${field} must be a string.`);
  if (opts.max && v.length > opts.max) fail(422, 'VALIDATION', `${field} must be at most ${opts.max} characters.`);
  return v;
}

export function int(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): number | undefined {
  if (v == null || v === '') {
    if (opts.optional) return undefined;
    fail(422, 'VALIDATION', `${field} is required.`);
  }
  const n = Number(v);
  if (!Number.isInteger(n)) fail(422, 'VALIDATION', `${field} must be an integer.`);
  if (opts.min != null && n < opts.min) fail(422, 'VALIDATION', `${field} must be ≥ ${opts.min}.`);
  if (opts.max != null && n > opts.max) fail(422, 'VALIDATION', `${field} must be ≤ ${opts.max}.`);
  return n;
}

import fs from 'node:fs';
import path from 'node:path';
import { buildSeedDatabase } from '@aus/demo-data';
import type { Database } from '@aus/demo-data';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export let db: Database;

export function loadOrSeed(): void {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as Database;
      console.log(`[mock-api] loaded persisted store from ${DB_FILE} (seeded ${db.meta.seededAt})`);
      return;
    } catch (err) {
      console.warn('[mock-api] persisted store unreadable, reseeding', err);
    }
  }
  resetDb();
}

let saveTimer: NodeJS.Timeout | null = null;
export function persist(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 250);
}

export function persistNow(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1));
}

export function resetDb(): Database {
  db = buildSeedDatabase();
  persistNow();
  console.log('[mock-api] database reseeded');
  return db;
}

// ---------------------------------------------------------------- shared counters/helpers

export function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function nextOrderNumber(): string {
  db.meta.orderSeq += 1;
  return `ORD-${db.meta.orderSeq}`;
}

const DOC_PREFIX: Record<string, string> = {
  ORDER_CONFIRMATION: 'OC', INVOICE: 'INV', RECEIPT: 'RC', PACKING_SLIP: 'PS', CREDIT_NOTE: 'CN',
};

export function nextDocNumber(type: string): string {
  const prefix = DOC_PREFIX[type] ?? 'DOC';
  const seq = (db.meta.docSeqs[prefix] ?? 0) + 1;
  db.meta.docSeqs[prefix] = seq;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export function audit(actor: string, actorRole: string | undefined, action: string, resource: string, summary: string, requestId: string): void {
  db.audit.unshift({
    id: nextId('aud'), actor, actorRole: actorRole as never, action, resource, summary, requestId,
    createdAt: new Date().toISOString(),
  });
}

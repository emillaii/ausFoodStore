import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { loadOrSeed, persistNow, resetDb } from './db';
import { ApiFail, ok, rid } from './http';
import { registerAuthRoutes } from './auth';
import { registerCatalogRoutes } from './catalog';
import { registerCheckoutRoutes, sweepExpiredAttempts } from './checkout';
import { registerOrderRoutes } from './orders';
import { registerFulfilmentRoutes } from './fulfilment';
import { registerInventoryRoutes } from './inventory';
import { registerAdminRoutes } from './admin';
import { registerReportRoutes } from './reports';
import { db } from './db';
import { DEMO_SCENARIOS } from '@aus/demo-data';
import { PERMISSION_MATRIX, ROLE_LABELS } from '@aus/contracts';
import type { Paged, Product } from '@aus/contracts';
import { availableOf } from './domain';

const PORT = Number(process.env.MOCK_API_PORT ?? 4000);

loadOrSeed();

const app = express();
app.use(express.json({ limit: '1mb' }));

// Request id + demo banner
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.rid = `req-${Math.random().toString(36).slice(2, 10)}`;
  res.setHeader('X-Demo-Environment', 'true');
  res.setHeader('X-Request-Id', res.locals.rid);
  // The front-ends call /api/* through the Vite dev proxy — strip the prefix so
  // the same paths work proxied (dev) and direct (production gateway).
  if (req.url.startsWith('/api/') || req.url === '/api') {
    req.url = req.url.replace(/^\/api/, '') || '/';
  }
  next();
});

// Demo-panel endpoints (never exposed in production builds — see docs/architecture.md)
app.get('/demo/info', (req, res) => {
  ok(res, {
    demo: true,
    seededAt: db.meta.seededAt,
    scenarios: DEMO_SCENARIOS,
    demoAccounts: {
      customers: db.customers.map((c) => ({ email: c.email, password: 'demo1234', name: `${c.firstName} ${c.lastName}`, member: c.member })),
      staff: db.staff.map((s) => ({ id: s.id, name: s.name, role: s.role, roleLabel: ROLE_LABELS[s.role] })),
    },
    permissions: PERMISSION_MATRIX,
  });
});

app.post('/demo/reset', (req, res) => {
  const fresh = resetDb();
  ok(res, { reset: true, seededAt: fresh.meta.seededAt });
});

app.get('/demo/state-summary', (req, res) => {
  ok(res, {
    orders: db.orders.length,
    attempts: db.checkoutAttempts.map((a) => ({ id: a.id, status: a.status, expires: a.reservationExpiresAt })),
    finalUnitSku: 'OIL-TRF-100',
    truffleOil: db.inventory['sku-oil-trf-100'],
  });
});

registerAuthRoutes(app);
registerCatalogRoutes(app);
registerCheckoutRoutes(app);
registerOrderRoutes(app);
registerFulfilmentRoutes(app);
registerInventoryRoutes(app);
registerAdminRoutes(app);
registerReportRoutes(app);

app.get('/health', (req, res) => ok(res, { ok: true, demo: true }));

// 404 + structured errors
app.use((req: Request, res: Response) => {
  res.status(404).json({ code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}`, requestId: rid(res) });
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiFail) {
    res.status(err.status).json({ code: err.code, message: err.message, requestId: rid(res), details: err.details });
    return;
  }
  console.error('[mock-api] unhandled error', err);
  res.status(500).json({ code: 'DEMO_ERROR', message: 'Unexpected mock API error', requestId: rid(res) });
});

// Reservation expiry sweeper (§6.3): a visual countdown is never the authority.
setInterval(() => {
  sweepExpiredAttempts();
  persistNow();
}, 15_000);

app.listen(PORT, () => {
  console.log(`[mock-api] Demo commerce API on http://localhost:${PORT} — DEMO ENVIRONMENT`);
  console.log('[mock-api] Reset: POST /demo/reset (or `npm run demo:reset` from the repo root)');
});

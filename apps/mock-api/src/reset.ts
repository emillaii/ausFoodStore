import { resetDb } from './db';
import { buildSeedDatabase } from '@aus/demo-data';

const fresh = resetDb();
void buildSeedDatabase;
console.log('Demo store reset. Seeded at', fresh.meta.seededAt);
console.log('Products:', fresh.products.length, '| Orders:', fresh.orders.length, '| Staff:', fresh.staff.length);

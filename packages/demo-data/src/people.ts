import type { Address, Cart, ConsentRecord, Customer, StaffUser } from '@aus/contracts';
import type { SeedCtx } from './types';

const DAY = 86_400_000;

export function buildPeople(ctx: SeedCtx): {
  staff: StaffUser[]; customers: Customer[]; addresses: Record<string, Address[]>; carts: Record<string, Cart>;
} {
  const staff: StaffUser[] = [
    { id: 'staff-admin', name: 'Sarah Chen', email: 'sarah.chen@ausfoodstore.demo', role: 'ADMIN', active: true },
    { id: 'staff-orders', name: 'Tom Baker', email: 'tom.baker@ausfoodstore.demo', role: 'ORDER_STAFF', active: true },
    { id: 'staff-wh', name: 'Raj Patel', email: 'raj.patel@ausfoodstore.demo', role: 'WAREHOUSE', active: true },
    { id: 'staff-cs', name: 'Emily Wong', email: 'emily.wong@ausfoodstore.demo', role: 'CUSTOMER_SERVICE', active: true },
    { id: 'staff-fin', name: 'Marcus Hill', email: 'marcus.hill@ausfoodstore.demo', role: 'FINANCE', active: true },
  ];

  const addr = (id: string, name: string, phone: string, line1: string, suburb: string, state: string, postcode: string, defShip: boolean, defBill: boolean, line2?: string): Address =>
    ({ id, name, phone, line1, line2, suburb, state, postcode, country: 'AU', isDefaultShipping: defShip, isDefaultBilling: defBill });

  const consent = (marketing: boolean, analytics: boolean, at: number): ConsentRecord[] =>
    [{ marketing, analytics, changedAt: ctx.iso(at) }];

  const customers: Customer[] = [
    {
      id: 'cust-ava', email: 'ava@example.com', password: 'demo1234', firstName: 'Ava', lastName: 'Thompson',
      phone: '0412 000 111', member: true, state: 'ACTIVE', consentHistory: consent(true, true, -40 * DAY),
      notes: [{ id: 'note-1', authorId: 'staff-cs', authorName: 'Emily Wong', body: 'Prefers deliveries after 5pm.', createdAt: ctx.iso(-12 * DAY) }],
      createdAt: ctx.iso(-40 * DAY),
    },
    {
      id: 'cust-liam', email: 'liam@example.com', password: 'demo1234', firstName: 'Liam', lastName: 'Nguyen',
      phone: '0423 000 222', member: false, state: 'ACTIVE', consentHistory: consent(false, true, -30 * DAY),
      notes: [], createdAt: ctx.iso(-30 * DAY),
    },
    {
      id: 'cust-mia', email: 'mia@example.com', password: 'demo1234', firstName: 'Mia', lastName: 'Rodriguez',
      phone: '0434 000 333', member: true, state: 'ACTIVE', consentHistory: consent(true, false, -25 * DAY),
      notes: [], createdAt: ctx.iso(-25 * DAY),
    },
    {
      id: 'cust-noah', email: 'noah@example.com', password: 'demo1234', firstName: 'Noah', lastName: 'Clarke',
      phone: '0456 000 444', member: false, state: 'ACTIVE', consentHistory: consent(false, false, -10 * DAY),
      notes: [], createdAt: ctx.iso(-10 * DAY),
    },
    {
      id: 'cust-olivia', email: 'olivia@example.com', password: 'demo1234', firstName: 'Olivia', lastName: 'Bennett',
      phone: '0467 000 555', member: false, state: 'ACTIVE', consentHistory: consent(true, true, -8 * DAY),
      notes: [], createdAt: ctx.iso(-8 * DAY),
    },
  ];

  const addresses: Record<string, Address[]> = {
    'cust-ava': [
      addr('addr-ava-home', 'Ava Thompson', '0412 000 111', '14 Crown Street', 'Surry Hills', 'NSW', '2010', true, true, 'Apt 3'),
      addr('addr-ava-work', 'Ava Thompson', '0412 000 111', '200 George Street', 'Sydney', 'NSW', '2000', false, false, 'Level 6'),
    ],
    'cust-liam': [addr('addr-liam-home', 'Liam Nguyen', '0423 000 222', '88 Sydney Road', 'Brunswick', 'VIC', '3056', true, true)],
    'cust-mia': [addr('addr-mia-home', 'Mia Rodriguez', '0434 000 333', '5 Rundle Mall', 'Adelaide', 'SA', '5000', true, true, 'Unit 12')],
    'cust-noah': [addr('addr-noah-home', 'Noah Clarke', '0456 000 444', '21 Hay Street', 'Perth', 'WA', '6000', true, true)],
    'cust-olivia': [addr('addr-olivia-home', 'Olivia Bennett', '0467 000 555', '3 London Circuit', 'Canberra', 'ACT', '2600', true, true)],
  };

  const carts: Record<string, Cart> = {
    'cust-ava': {
      ownerKey: 'cust-ava',
      lines: [
        { skuId: 'sku-mlk-whm-2l', quantity: 1, addedAt: ctx.iso(-1 * DAY) },
        { skuId: 'sku-ban-cav-1kg', quantity: 2, addedAt: ctx.iso(-1 * DAY) },
      ],
      version: 2, updatedAt: ctx.iso(-1 * DAY),
    },
  };

  return { staff, customers, addresses, carts };
}

import type {
  Address, AuditEvent, CheckoutAttempt, DocumentMeta, LoyaltyEntry, Order, OrderLine, PaymentRecord,
  Refund, ReturnRequest, Shipment,
} from '@aus/contracts';
import { taxComponentCents } from '@aus/contracts';
import type { SeedCtx } from './types';
import { applyMove } from './types';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

export function buildOrders(
  ctx: SeedCtx,
  addresses: Record<string, Address[]>,
): { orders: Order[]; attempts: CheckoutAttempt[]; loyalty: LoyaltyEntry[]; audit: AuditEvent[]; docSeqs: Record<string, number> } {
  const orders: Order[] = [];
  const loyalty: LoyaltyEntry[] = [];
  const audit: AuditEvent[] = [];
  const attempts: CheckoutAttempt[] = [];
  const docSeqs: Record<string, number> = { OC: 0, INV: 0, RC: 0, PS: 0, CN: 0 };
  let refundSeq = 0;
  let returnSeq = 0;

  const sku = (code: string) => ctx.skuByCode.get(code)!;
  const addrOf = (customerId: string) => addresses[customerId][0];

  const mkLine = (ref: string, code: string, qty: number, unitPriceCents: number): OrderLine => {
    const s = sku(code);
    const product = ctx.products.find((p) => p.id === s.productId)!;
    const lineTotalCents = unitPriceCents * qty;
    return {
      id: `ln-${ref}-${code.toLowerCase()}`, skuId: s.id, skuCode: s.code, productId: product.id,
      productName: product.name,
      optionSummary: Object.entries(s.optionValues).map(([k, v]) => `${k}: ${v}`).join(', ') || (s.packSize ?? ''),
      packSize: s.packSize, imageGlyph: product.imageGlyph, imageHue: product.imageHue,
      unitPriceCents, quantity: qty, taxClass: s.taxClass,
      taxCents: taxComponentCents(lineTotalCents, s.taxClass, 0.1),
      lineTotalCents, pickedQty: 0, shippedQty: 0, refundedQty: 0, exception: 'NONE',
    };
  };

  const doc = (order: Order, type: DocumentMeta['type'], atMs: number, by: string): DocumentMeta => {
    const prefix = { ORDER_CONFIRMATION: 'OC', INVOICE: 'INV', RECEIPT: 'RC', PACKING_SLIP: 'PS', CREDIT_NOTE: 'CN' }[type];
    const number = `${prefix}-${String(++docSeqs[prefix]).padStart(4, '0')}`;
    const meta: DocumentMeta = { id: `doc-${number.toLowerCase()}`, type, number, orderId: order.id, orderNumber: order.number, state: 'ISSUED', createdAt: ctx.iso(atMs), createdBy: by };
    order.documents.push(meta);
    return meta;
  };

  const lty = (customerId: string, type: LoyaltyEntry['type'], deltaPending: number, deltaAvailable: number, reference: string, atMs: number, reason?: string, expiresAt?: string) => {
    loyalty.push({ id: `lty-${String(loyalty.length + 1).padStart(4, '0')}`, customerId, type, deltaPending, deltaAvailable, reference, reason, expiresAt, createdAt: ctx.iso(atMs) });
  };

  const auditPush = (actor: string, role: string, action: string, resource: string, summary: string, atMs: number) => {
    audit.push({ id: `aud-${audit.length + 1}`, actor, actorRole: role as AuditEvent['actorRole'], action, resource, summary, requestId: `seed-${audit.length + 1}`, createdAt: ctx.iso(atMs) });
  };

  /** Replay the full paid-order inventory lifecycle: hold → commit → allocate → (dispatch?) */
  const flow = (order: Order, lines: OrderLine[], atMs: number, pickAtMs: number | null, dispatchAtMs: number | null, picked?: Record<string, number>) => {
    for (const l of lines) {
      applyMove(ctx, l.skuId, { reserved: l.quantity }, 'RESERVATION_HOLD', order.number, atMs, 'Payment authorisation hold');
      applyMove(ctx, l.skuId, {}, 'RESERVATION_COMMIT', order.number, atMs + 2 * MIN, 'Payment captured — reservation committed');
    }
    if (pickAtMs != null) {
      for (const l of lines) {
        applyMove(ctx, l.skuId, { reserved: -l.quantity, allocated: l.quantity }, 'PICK_ALLOCATE', order.number, pickAtMs, 'Picking started');
        const pickedQty = picked?.[l.skuCode] ?? l.quantity;
        l.pickedQty = pickedQty;
        if (pickedQty < l.quantity) {
          l.exception = 'SHORT_PICKED';
          applyMove(ctx, l.skuId, { allocated: 0 }, 'SHORT_PICK_RELEASE', order.number, pickAtMs + 10 * MIN, `Short pick: ${pickedQty}/${l.quantity} available — exception opened, ${l.quantity - pickedQty} held for re-pick`);
        }
      }
    }
    if (dispatchAtMs != null) {
      for (const l of lines) {
        const shipQty = picked?.[l.skuCode] ?? l.quantity;
        if (shipQty <= 0) continue;
        l.shippedQty = shipQty;
        applyMove(ctx, l.skuId, { allocated: -shipQty, onHand: -shipQty }, 'DISPATCH', order.number, dispatchAtMs, `Dispatched ${shipQty} of ${l.quantity}`);
      }
    }
  };

  // ---------------------------------------------------------------- ORD-1001 — Ava — delivered
  {
    const at = -9 * DAY;
    const lines = [
      mkLine('1001', 'BRD-SRD-680', 2, 750),
      mkLine('1001', 'COF-ARA-1KG', 1, 3200),
      mkLine('1001', 'WTR-SPK-12', 2, 990),
    ];
    const subtotal = 6680, shipping = 990, total = 7670;
    const order: Order = {
      id: 'ord-1001', number: 'ORD-1001', ownerKey: 'cust-ava', customerId: 'cust-ava',
      contact: { name: 'Ava Thompson', email: 'ava@example.com', phone: '0412 000 111' },
      lines, shippingAddress: { ...addrOf('cust-ava') },
      paymentStatus: 'PAID', fulfilmentStatus: 'DELIVERED',
      subtotalCents: subtotal, coinDiscountCents: 0, manualDiscountCents: 0, shippingCents: shipping, totalCents: total,
      gstIncludedCents: taxComponentCents(1980, 'GST', 0.1),
      coinsEarnedPending: 0, coinsEarnedAvailable: 66, coinsRedeemed: 0,
      payments: [{ id: 'pay-1001', providerRef: 'demo_pi_1001', method: 'CARD_DEMO', amountCents: total, status: 'SUCCEEDED', refundedCents: 0, createdAt: ctx.iso(at + 2 * MIN) }],
      refunds: [], shipments: [], documents: [], returns: [], internalNotes: [],
      exception: null, placedAt: ctx.iso(at), updatedAt: ctx.iso(at),
    };
    const shipment: Shipment = {
      id: 'shp-1001', carrier: 'SpeedEx (demo)', service: 'Road', trackingNumber: 'SPX1001AU',
      items: lines.map((l) => ({ lineId: l.id, quantity: l.quantity })),
      state: 'DISPATCHED', dispatchedAt: ctx.iso(-5 * DAY), createdAt: ctx.iso(-5 * DAY),
    };
    order.shipments.push(shipment);
    flow(order, lines, at, -6 * DAY, -5 * DAY);
    doc(order, 'ORDER_CONFIRMATION', at + 3 * MIN, 'system');
    doc(order, 'INVOICE', at + 2 * MIN, 'system');
    doc(order, 'RECEIPT', at + 2 * MIN, 'system');
    orders.push(order);
    lty('cust-ava', 'EARN_PENDING', 66, 0, 'ORD-1001', at, 'Sample rule: 1 coin per AUD 1 after discounts');
    lty('cust-ava', 'PENDING_MATURED', -66, 66, 'ORD-1001', -5 * DAY, 'Order fully shipped — coins available');
  }

  // ---------------------------------------------------------------- ORD-1002 — Ava — partial shipment + pending return
  {
    const at = -6 * DAY;
    const lines = [
      mkLine('1002', 'EGG-FR-12PK', 1, 580),
      mkLine('1002', 'CHD-TST-500', 1, 890),
      mkLine('1002', 'TTH-MNT-200', 2, 480),
    ];
    const subtotal = 2430, coinsRedeemed = 200, shipping = 990, total = 3220;
    const order: Order = {
      id: 'ord-1002', number: 'ORD-1002', ownerKey: 'cust-ava', customerId: 'cust-ava',
      contact: { name: 'Ava Thompson', email: 'ava@example.com', phone: '0412 000 111' },
      lines, shippingAddress: { ...addrOf('cust-ava') },
      paymentStatus: 'PAID', fulfilmentStatus: 'PARTIALLY_SHIPPED',
      subtotalCents: subtotal, coinDiscountCents: 200, manualDiscountCents: 0, shippingCents: shipping, totalCents: total,
      gstIncludedCents: taxComponentCents(960, 'GST', 0.1),
      coinsEarnedPending: 22, coinsEarnedAvailable: 0, coinsRedeemed,
      payments: [{ id: 'pay-1002', providerRef: 'demo_pi_1002', method: 'CARD_DEMO', amountCents: total, status: 'SUCCEEDED', refundedCents: 0, createdAt: ctx.iso(at + 2 * MIN) }],
      refunds: [], shipments: [], documents: [], returns: [], internalNotes: [],
      exception: null, placedAt: ctx.iso(at), updatedAt: ctx.iso(at),
    };
    const shipment: Shipment = {
      id: 'shp-1002', carrier: 'SpeedEx (demo)', service: 'Road', trackingNumber: 'SPX1002AU',
      items: [{ lineId: lines[1].id, quantity: 1 }, { lineId: lines[2].id, quantity: 2 }],
      state: 'DISPATCHED', dispatchedAt: ctx.iso(-3 * DAY), createdAt: ctx.iso(-3 * DAY),
    };
    order.shipments.push(shipment);
    lines[1].shippedQty = 1; lines[2].shippedQty = 2;
    flow(order, lines, at, -4 * DAY, -3 * DAY);
    doc(order, 'ORDER_CONFIRMATION', at + 3 * MIN, 'system');
    doc(order, 'INVOICE', at + 2 * MIN, 'system');
    doc(order, 'PACKING_SLIP', -4 * DAY, 'Raj Patel');
    const ret: ReturnRequest = {
      id: 'ret-1', orderId: order.id, orderNumber: order.number, customerId: 'cust-ava',
      customerName: 'Ava Thompson', customerEmail: 'ava@example.com',
      items: [{ lineId: lines[2].id, quantity: 1, reason: 'Changed my mind' }],
      status: 'REQUESTED', requestedBy: 'Ava Thompson (customer)', createdAt: ctx.iso(-2 * DAY),
    };
    order.returns.push(ret);
    orders.push(order);
    lty('cust-ava', 'REDEEM_HOLD', 0, -200, 'ORD-1002', at, '200 coins redeemed at checkout');
    lty('cust-ava', 'REDEEM_COMMIT', 0, 0, 'ORD-1002', at + 2 * MIN, 'Payment captured — redeemed coins committed');
    lty('cust-ava', 'EARN_PENDING', 22, 0, 'ORD-1002', at, 'Sample rule: 1 coin per AUD 1 after discounts (pending until full shipment)');
  }

  // ---------------------------------------------------------------- ORD-1003 — Liam — picking, short-pick exception
  {
    const at = -3 * DAY;
    const lines = [
      mkLine('1003', 'RIC-BAS-1KG', 2, 490),
      mkLine('1003', 'RCR-SES-100', 3, 290),
    ];
    const subtotal = 1850, shipping = 990, total = 2840;
    const order: Order = {
      id: 'ord-1003', number: 'ORD-1003', ownerKey: 'cust-liam', customerId: 'cust-liam',
      contact: { name: 'Liam Nguyen', email: 'liam@example.com', phone: '0423 000 222' },
      lines, shippingAddress: { ...addrOf('cust-liam') },
      paymentStatus: 'PAID', fulfilmentStatus: 'PICKING',
      subtotalCents: subtotal, coinDiscountCents: 0, manualDiscountCents: 0, shippingCents: shipping, totalCents: total,
      gstIncludedCents: 0,
      coinsEarnedPending: 18, coinsEarnedAvailable: 0, coinsRedeemed: 0,
      payments: [{ id: 'pay-1003', providerRef: 'demo_pi_1003', method: 'CARD_DEMO', amountCents: total, status: 'SUCCEEDED', refundedCents: 0, createdAt: ctx.iso(at + 2 * MIN) }],
      refunds: [], shipments: [], documents: [], returns: [], internalNotes: [
        { id: 'note-1003', authorId: 'staff-wh', authorName: 'Raj Patel', body: 'Only 1 bag of rice on the shelf. Opened short-pick exception — rest expected tomorrow.', createdAt: ctx.iso(-1 * DAY + 20 * MIN) },
      ],
      exception: null, placedAt: ctx.iso(at), updatedAt: ctx.iso(-1 * DAY),
    };
    flow(order, lines, at, -1 * DAY, null, { 'RIC-BAS-1KG': 1 });
    doc(order, 'ORDER_CONFIRMATION', at + 3 * MIN, 'system');
    doc(order, 'INVOICE', at + 2 * MIN, 'system');
    doc(order, 'PACKING_SLIP', -1 * DAY, 'Raj Patel');
    orders.push(order);
    lty('cust-liam', 'EARN_PENDING', 18, 0, 'ORD-1003', at, 'Sample rule: 1 coin per AUD 1 after discounts');
  }

  // ---------------------------------------------------------------- ORD-1004 — Mia — paid, ready to pick
  {
    const at = -2 * DAY;
    const lines = [
      mkLine('1004', 'ALM-RST-750', 1, 1450),
      mkLine('1004', 'DSH-LIQ-1L', 2, 450),
    ];
    const subtotal = 2350, shipping = 990, total = 3340;
    const order: Order = {
      id: 'ord-1004', number: 'ORD-1004', ownerKey: 'cust-mia', customerId: 'cust-mia',
      contact: { name: 'Mia Rodriguez', email: 'mia@example.com', phone: '0434 000 333' },
      lines, shippingAddress: { ...addrOf('cust-mia') },
      paymentStatus: 'PAID', fulfilmentStatus: 'READY_TO_PICK',
      subtotalCents: subtotal, coinDiscountCents: 0, manualDiscountCents: 0, shippingCents: shipping, totalCents: total,
      gstIncludedCents: 0,
      coinsEarnedPending: 23, coinsEarnedAvailable: 0, coinsRedeemed: 0,
      payments: [{ id: 'pay-1004', providerRef: 'demo_pi_1004', method: 'CARD_DEMO', amountCents: total, status: 'SUCCEEDED', refundedCents: 0, createdAt: ctx.iso(at + 2 * MIN) }],
      refunds: [], shipments: [], documents: [], returns: [], internalNotes: [],
      exception: null, placedAt: ctx.iso(at), updatedAt: ctx.iso(at),
    };
    flow(order, lines, at, null, null);
    doc(order, 'ORDER_CONFIRMATION', at + 3 * MIN, 'system');
    doc(order, 'INVOICE', at + 2 * MIN, 'system');
    orders.push(order);
    lty('cust-mia', 'EARN_PENDING', 23, 0, 'ORD-1004', at, 'Sample rule: 1 coin per AUD 1 after discounts');
  }

  // ---------------------------------------------------------------- ORD-1005 — Liam — delivered, fully refunded (damaged return)
  {
    const at = -4 * DAY;
    const lines = [
      mkLine('1005', 'SHM-KAK-750', 1, 1150),
      mkLine('1005', 'HNY-RAW-500', 1, 980),
    ];
    const subtotal = 2130, shipping = 990, total = 3120;
    const order: Order = {
      id: 'ord-1005', number: 'ORD-1005', ownerKey: 'cust-liam', customerId: 'cust-liam',
      contact: { name: 'Liam Nguyen', email: 'liam@example.com', phone: '0423 000 222' },
      lines, shippingAddress: { ...addrOf('cust-liam') },
      paymentStatus: 'REFUNDED', fulfilmentStatus: 'DELIVERED',
      subtotalCents: subtotal, coinDiscountCents: 0, manualDiscountCents: 0, shippingCents: shipping, totalCents: total,
      gstIncludedCents: taxComponentCents(1150, 'GST', 0.1),
      coinsEarnedPending: 0, coinsEarnedAvailable: 0, coinsRedeemed: 0,
      payments: [{ id: 'pay-1005', providerRef: 'demo_pi_1005', method: 'CARD_DEMO', amountCents: total, status: 'REFUNDED', refundedCents: total, createdAt: ctx.iso(at + 2 * MIN) }],
      refunds: [], shipments: [], documents: [], returns: [], internalNotes: [],
      exception: null, placedAt: ctx.iso(at), updatedAt: ctx.iso(-2 * HOUR),
    };
    const shipment: Shipment = {
      id: 'shp-1005', carrier: 'SpeedEx (demo)', service: 'Express', trackingNumber: 'SPX1005AU',
      items: lines.map((l) => ({ lineId: l.id, quantity: l.quantity })),
      state: 'DISPATCHED', dispatchedAt: ctx.iso(-36 * HOUR), createdAt: ctx.iso(-36 * HOUR),
    };
    order.shipments.push(shipment);
    flow(order, lines, at, -2 * DAY, -36 * HOUR);
    doc(order, 'ORDER_CONFIRMATION', at + 3 * MIN, 'system');
    doc(order, 'INVOICE', at + 2 * MIN, 'system');
    doc(order, 'RECEIPT', at + 2 * MIN, 'system');
    const refund: Refund = {
      id: `ref-${++refundSeq}`, orderId: order.id, paymentId: 'pay-1005', amountCents: total,
      status: 'SUCCEEDED', reason: 'Both items damaged in transit', requestedBy: 'Marcus Hill (finance)',
      creditNoteNumber: `CN-${String(++docSeqs.CN).padStart(4, '0')}`, disposition: 'DAMAGED',
      createdAt: ctx.iso(-8 * HOUR), resolvedAt: ctx.iso(-2 * HOUR),
    };
    order.refunds.push(refund);
    const ret: ReturnRequest = {
      id: `ret-${++returnSeq}`, orderId: order.id, orderNumber: order.number, customerId: 'cust-liam',
      customerName: 'Liam Nguyen', customerEmail: 'liam@example.com',
      items: [
        { lineId: lines[0].id, quantity: 1, reason: 'Damaged in transit' },
        { lineId: lines[1].id, quantity: 1, reason: 'Damaged in transit' },
      ],
      status: 'COMPLETED', decisionReason: 'Photos provided; full refund approved. Stock disposed — not returned to saleable inventory.',
      stockDisposition: 'DAMAGED', refund, requestedBy: 'Liam Nguyen (customer)',
      createdAt: ctx.iso(-8 * HOUR), decidedAt: ctx.iso(-2 * HOUR),
    };
    order.returns.push(ret);
    for (const l of lines) {
      applyMove(ctx, l.skuId, {}, 'RETURN_DISPOSED', order.number, -2 * HOUR, 'Return approved with DAMAGED disposition — no saleable stock change');
    }
    doc(order, 'CREDIT_NOTE', -2 * HOUR, 'Marcus Hill');
    orders.push(order);
    lty('cust-liam', 'EARN_PENDING', 21, 0, 'ORD-1005', at, 'Sample rule: 1 coin per AUD 1 after discounts');
    lty('cust-liam', 'PENDING_MATURED', -21, 21, 'ORD-1005', -36 * HOUR, 'Order delivered — coins available');
    lty('cust-liam', 'EARN_REVERSAL', 0, -21, 'ORD-1005', -2 * HOUR, 'Proportional earning reversal on full refund (sample policy)');
  }

  // ---------------------------------------------------------------- ORD-1006 — Olivia — staff manual order, invoice before payment
  {
    const at = -1 * DAY;
    const lines = [
      mkLine('1006', 'LDY-PWD-4KG', 1, 1890),
      mkLine('1006', 'HND-LEM-500', 2, 390),
    ];
    const subtotal = 2670, discount = 500, shipping = 990, total = 3160;
    const order: Order = {
      id: 'ord-1006', number: 'ORD-1006', ownerKey: 'cust-olivia', customerId: 'cust-olivia',
      contact: { name: 'Olivia Bennett', email: 'olivia@example.com', phone: '0467 000 555' },
      lines, shippingAddress: { ...addrOf('cust-olivia') },
      paymentStatus: 'UNPAID', fulfilmentStatus: 'INVOICE_ISSUED',
      subtotalCents: subtotal, coinDiscountCents: 0, manualDiscountCents: discount, shippingCents: shipping, totalCents: total,
      gstIncludedCents: taxComponentCents(1890, 'GST', 0.1) + taxComponentCents(780, 'GST', 0.1),
      coinsEarnedPending: 0, coinsEarnedAvailable: 0, coinsRedeemed: 0,
      payments: [], refunds: [], shipments: [], documents: [], returns: [],
      internalNotes: [{ id: 'note-1006', authorId: 'staff-orders', authorName: 'Tom Baker', body: 'Phone order. $5 authorised discount approved by Sarah Chen (ADMIN).', createdAt: ctx.iso(at) }],
      exception: null, placedAt: ctx.iso(at), createdBy: 'Tom Baker', updatedAt: ctx.iso(at),
    };
    // Invoice issued before payment; no stock reservation yet (prototype default §7.4).
    flow(order, [], at, null, null);
    doc(order, 'INVOICE', at + 30 * MIN, 'Tom Baker');
    orders.push(order);
    auditPush('Tom Baker', 'ORDER_STAFF', 'ORDER_CREATED', 'ord-1006', 'Manual phone order for Olivia Bennett — 3 units', at);
    auditPush('Tom Baker', 'ORDER_STAFF', 'INVOICE_ISSUED', 'ord-1006', `Invoice INV-${String(docSeqs.INV).padStart(4, '0')} issued (unpaid); $5 authorised discount`, at + 30 * MIN);
  }

  // ---------------------------------------------------------------- attempts — Noah pending payment (holds the final truffle-oil unit)
  {
    const at = -2 * MIN;
    const lines = [mkLine('att-noah', 'OIL-TRF-100', 1, 2490), mkLine('att-noah', 'CHO-DK70-180', 1, 550)];
    const subtotal = 3040, shipping = 990, total = 4030;
    const attempt: CheckoutAttempt = {
      id: 'att-noah', ownerKey: 'cust-noah', customerId: 'cust-noah',
      contact: { name: 'Noah Clarke', email: 'noah@example.com', phone: '0456 000 444' },
      shippingAddress: { ...addrOf('cust-noah') },
      lines: lines.map((l) => ({ ...l, availableAtQuote: 10 })),
      subtotalCents: subtotal, memberDiscountCents: 0, coinRedeemed: 0, coinDiscountCents: 0,
      shippingCents: shipping, taxCents: { gstIncludedCents: 0, gstFreeCents: 0 },
      totalCents: total, status: 'RESERVED', reservationExpiresAt: ctx.iso(13 * MIN),
      reservationCommitted: false, createdAt: ctx.iso(at),
    };
    for (const l of lines) applyMove(ctx, l.skuId, { reserved: l.quantity }, 'RESERVATION_HOLD', 'ATT-NOAH', at, 'Payment authorisation hold (pending)');
    attempts.push(attempt);
  }

  // ---------------------------------------------------------------- attempt — Mia expired (stock + coin holds released)
  {
    const at = -26 * HOUR;
    const lines = [mkLine('att-mia-x', 'TEA-EBT-100', 1, 670), mkLine('att-mia-x', 'OAT-ROL-900', 2, 430)];
    const subtotal = 1530, shipping = 990, total = 2420;
    const attempt: CheckoutAttempt = {
      id: 'att-mia-expired', ownerKey: 'cust-mia', customerId: 'cust-mia',
      contact: { name: 'Mia Rodriguez', email: 'mia@example.com', phone: '0434 000 333' },
      shippingAddress: { ...addrOf('cust-mia') },
      lines: lines.map((l) => ({ ...l, availableAtQuote: 10 })),
      subtotalCents: subtotal, memberDiscountCents: 0, coinRedeemed: 100, coinDiscountCents: 100,
      shippingCents: shipping, taxCents: { gstIncludedCents: 0, gstFreeCents: 0 },
      totalCents: total, status: 'EXPIRED', reservationExpiresAt: ctx.iso(-25 * HOUR),
      reservationCommitted: false, createdAt: ctx.iso(at),
    };
    for (const l of lines) {
      applyMove(ctx, l.skuId, { reserved: l.quantity }, 'RESERVATION_HOLD', 'ATT-MIA-EXPIRED', at, 'Payment authorisation hold');
      applyMove(ctx, l.skuId, { reserved: -l.quantity }, 'RESERVATION_RELEASE', 'ATT-MIA-EXPIRED', -25 * HOUR, 'Reservation expired — stock released');
    }
    attempts.push(attempt);
    lty('cust-mia', 'REDEEM_HOLD', 0, -100, 'ATT-MIA-EXPIRED', at, '100 coins held at checkout');
    lty('cust-mia', 'REDEEM_RELEASE', 0, 100, 'ATT-MIA-EXPIRED', -25 * HOUR, 'Checkout expired — coin hold released');
    lty('cust-mia', 'EARN_AVAILABLE', 0, 300, 'SEED-HISTORY', -15 * DAY, 'Prior purchase history (seed)');
    lty('cust-ava', 'EARN_AVAILABLE', 0, 300, 'SEED-HISTORY', -40 * DAY, 'Prior purchase history (seed)');
    lty('cust-liam', 'MANUAL_ADJUSTMENT', 0, 50, 'ADJ-1', -2 * DAY, 'Goodwill gesture — delivery delay', ctx.iso(363 * DAY));
    auditPush('Sarah Chen', 'ADMIN', 'LOYALTY_ADJUSTMENT', 'cust-liam', '+50 coins manual adjustment — goodwill gesture', -2 * DAY);
    auditPush('Marcus Hill', 'FINANCE', 'REFUND_ISSUED', 'ord-1005', `Full refund $31.20 issued; credit note CN-${String(docSeqs.CN).padStart(4, '0')}; stock disposition DAMAGED`, -2 * HOUR);
  }

  return { orders, attempts, loyalty, audit, docSeqs };
}

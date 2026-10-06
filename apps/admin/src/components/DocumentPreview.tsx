import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Loading, Modal, StatusBadge } from '@aus/ui';
import { formatAud } from '@aus/contracts';
import type { DocumentMeta, Order } from '@aus/contracts';

/** Printable document preview, watermarked DEMO. Generated client-side from the order snapshot. */
export function DocumentPreview({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['doc', docId],
    queryFn: () => api.admin.document(docId!),
    enabled: !!docId,
  });
  if (!docId) return null;

  const print = () => {
    const el = document.getElementById('doc-print-root');
    if (!el) return;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.document.write(`<html><head><title>Document (Demo)</title><style>
      body{font-family:-apple-system,Arial,sans-serif;padding:32px;color:#1c2420}
      .wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-size:96px;font-weight:900;color:rgba(179,50,31,.08);transform:rotate(-24deg);letter-spacing:.1em}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}
      th,td{padding:8px 6px;border-bottom:1px solid #e2e0da;text-align:left}
      .num{text-align:right}
      h1,h2{margin:0 0 4px}
    </style></head><body><div class="wm">DEMO</div>${el.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <Modal open onClose={onClose} title="Document preview">
      {isLoading && <Loading />}
      {data && <DocBody meta={data.meta as DocumentMeta} order={data.order as Order} onPrint={print} onClose={onClose} />}
    </Modal>
  );
}

function DocBody({ meta, order, onPrint, onClose }: { meta: DocumentMeta; order: Order; onPrint: () => void; onClose: () => void }) {
  const title = meta.type.replaceAll('_', ' ');
  return (
    <div>
      <div className="doc-preview" id="doc-print-root">
        <span className="watermark" aria-hidden="true">DEMO</span>
        <div className="row-between">
          <div>
            <h2 style={{ margin: 0 }}>🥩 Aus Meat Co.</h2>
            <div className="xsmall muted">DEMO DOCUMENT — not a tax invoice. Aus Meat Co., Sydney NSW (sample address)</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h1 style={{ fontSize: '1.3rem', margin: 0 }}>{title}</h1>
            <div className="small"><strong>{meta.number}</strong></div>
            <div className="xsmall muted">{new Date(meta.createdAt).toLocaleDateString('en-AU')}</div>
          </div>
        </div>
        <hr className="divider" />
        <div className="small">
          <strong>Order:</strong> {order.number} · <strong>Placed:</strong> {new Date(order.placedAt).toLocaleDateString('en-AU')}<br />
          <strong>Billed to:</strong> {order.contact.name}, {order.contact.email} · {order.shippingAddress.phone}<br />
          <strong>Deliver to:</strong> {order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}, {order.shippingAddress.suburb} {order.shippingAddress.state} {order.shippingAddress.postcode}
        </div>
        <table className="doc-lines">
          <thead>
            <tr><th>Item</th><th>SKU</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Total</th><th>Tax</th></tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.productName}{l.optionSummary ? <div className="xsmall muted">{l.optionSummary}</div> : null}</td>
                <td className="xsmall">{l.skuCode}</td>
                <td className="num">{l.quantity}</td>
                <td className="num">{formatAud(l.unitPriceCents)}</td>
                <td className="num">{formatAud(l.lineTotalCents)}</td>
                <td className="xsmall">{l.taxClass === 'GST' ? 'incl. GST' : 'GST-free'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ maxWidth: 280, marginLeft: 'auto' }} className="mt-4">
          <div className="row-between small"><span>Subtotal</span><span>{formatAud(order.subtotalCents)}</span></div>
          {order.manualDiscountCents > 0 && <div className="row-between small"><span>Discount</span><span>−{formatAud(order.manualDiscountCents)}</span></div>}
          {order.coinDiscountCents > 0 && <div className="row-between small"><span>Coins redeemed</span><span>−{formatAud(order.coinDiscountCents)}</span></div>}
          <div className="row-between small"><span>Delivery</span><span>{order.shippingCents === 0 ? 'FREE' : formatAud(order.shippingCents)}</span></div>
          <div className="row-between"><strong>Total (AUD)</strong><strong>{formatAud(order.totalCents)}</strong></div>
          <div className="xsmall muted">Includes GST: {formatAud(order.gstIncludedCents)} (sample classification)</div>
        </div>
        <p className="xsmall muted mt-4 mb-0">Payment status: {order.paymentStatus.replaceAll('_', ' ')} · Fulfilment: {order.fulfilmentStatus.replaceAll('_', ' ')} · Generated {new Date().toLocaleString('en-AU')}</p>
      </div>
      <div className="row mt-4">
        <Button className="grow" onClick={onPrint}>🖨 Print / save as PDF (watermarked)</Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <p className="xsmall muted mt-2 mb-0"><StatusBadge status="DRAFT" /> Simulated document — production generates real PDFs in private storage with expiring access links.</p>
    </div>
  );
}

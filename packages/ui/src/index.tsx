import React, { useEffect, useRef } from 'react';
import { formatAud } from '@aus/contracts';

/** ---------------- product image placeholder (original synthetic asset) ---------------- */
export function ProductImage({ glyph, hue, size = 'md', alt }: { glyph: string; hue: number; size?: 'sm' | 'md' | 'lg'; alt: string }) {
  return (
    <div
      className={`pimg pimg-${size}`}
      role="img"
      aria-label={alt}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 45% 92%), hsl(${(hue + 40) % 360} 40% 84%))` }}
    >
      <span className="glyph" aria-hidden="true">{glyph}</span>
    </div>
  );
}

/** ---------------- button with loading ---------------- */
export function Button({
  variant = 'primary', size, block, loading, children, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm'; block?: boolean; loading?: boolean }) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', block ? 'btn-block' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={rest.disabled || loading} {...rest}>
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** ---------------- form fields ---------------- */
export function Field({ label, error, hint, children, htmlFor }: { label?: string; error?: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      {label && <label className="field-label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}

/** ---------------- badge ---------------- */
const BADGE_TONES = ['neutral', 'success', 'info', 'warn', 'danger', 'loyalty', 'sale'] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];
export function Badge({ tone = 'neutral', dot, children }: { tone?: BadgeTone; dot?: boolean; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{dot && <span className="dot" aria-hidden="true" />}{children}</span>;
}

/** ---------------- price display ---------------- */
export function Price({ cents, previousCents, sale, member, className }: { cents: number; previousCents?: number; sale?: boolean; member?: boolean; className?: string }) {
  return (
    <span className={`${sale ? 'price-sale' : member ? 'price-member' : 'price'} ${className ?? ''}`}>
      {formatAud(cents)}
      {previousCents != null && <span className="price-was">{formatAud(previousCents)}</span>}
    </span>
  );
}

/** ---------------- quantity stepper ---------------- */
export function Stepper({ quantity, min = 1, max, onChange, onRemove, ariaLabel }: { quantity: number; min?: number; max: number; onChange: (q: number) => void; onRemove?: () => void; ariaLabel: string }) {
  return (
    <span className="stepper" role="group" aria-label={ariaLabel}>
      <button
        type="button" aria-label={quantity <= min && onRemove ? `Remove ${ariaLabel}` : `Decrease quantity of ${ariaLabel}`}
        onClick={() => (quantity <= min && onRemove ? onRemove() : onChange(Math.max(min, quantity - 1)))}
      >
        {quantity <= min && onRemove ? '🗑' : '−'}
      </button>
      <span className="qty" aria-live="polite">{quantity}</span>
      <button type="button" aria-label={`Increase quantity of ${ariaLabel}`} disabled={quantity >= max} onClick={() => onChange(Math.min(max, quantity + 1))}>+</button>
    </span>
  );
}

/** ---------------- states ---------------- */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="state" role="status"><div className="spinner-lg" aria-hidden="true" />{label}</div>;
}

export function EmptyState({ icon = '🛒', title, body, action }: { icon?: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="state">
      <div className="icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {body && <p className="mb-0">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', error, onRetry }: { title?: string; error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unexpected error');
  return (
    <div className="state" role="alert">
      <div className="icon" aria-hidden="true">⚠️</div>
      <h3>{title}</h3>
      <p className="mb-0">{message}</p>
      {onRetry && <div className="mt-4"><Button variant="secondary" onClick={onRetry}>Try again</Button></div>}
    </div>
  );
}

/** ---------------- modal ---------------- */
export function Modal({ open, onClose, title, children, small }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; small?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dialog ${small ? 'dialog-sm' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="modal-title">
          <h3 className="mb-0">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** ---------------- status badge helper (never colour alone — tone + text) ---------------- */
export function StatusBadge({ status }: { status: string }) {
  const tone: BadgeTone = ({
    PAID: 'success', SUCCEEDED: 'success', DELIVERED: 'success', SHIPPED: 'success', ACTIVE: 'success', COMPLETED: 'success', AVAILABLE: 'success',
    PENDING: 'warn', PAYMENT_PENDING: 'warn', PENDING_PAYMENT: 'warn', REQUESTED: 'warn', INVOICE_ISSUED: 'warn', RESERVED: 'warn', DRAFT: 'neutral', UNPAID: 'neutral',
    READY_TO_PICK: 'info', PICKING: 'info', PICKED: 'info', PACKED: 'info', PARTIALLY_SHIPPED: 'info', PARTIALLY_REFUNDED: 'info',
    FAILED: 'danger', DECLINED: 'danger', EXPIRED: 'danger', CANCELLED: 'danger', REJECTED: 'danger', REFUND_PENDING: 'danger', SUSPENDED: 'danger', ARCHIVED: 'neutral',
    REFUNDED: 'neutral', AWAITING_PAYMENT: 'warn',
  } as Record<string, BadgeTone>)[status] ?? 'neutral';
  const label = status.replaceAll('_', ' ').toLowerCase();
  return <Badge tone={tone}><span className="sr-only">status: </span>{label}</Badge>;
}

export { formatAud } from '@aus/contracts';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { CartView } from '../lib/types';
import { Badge, Button, EmptyState, ErrorState, Loading, Price, ProductImage, Stepper } from '@aus/ui';
import { formatAud } from '@aus/contracts';

export default function Cart() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: cart, isLoading, error, refetch } = useQuery<CartView>({ queryKey: ['cart'], queryFn: () => api.cart() });

  const update = useMutation({
    mutationFn: (p: { skuId: string; quantity: number }) => api.setCartQuantity(p.skuId, p.quantity),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });
  const remove = useMutation({
    mutationFn: (skuId: string) => api.removeCartLine(skuId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });

  if (isLoading) return <Loading label="Loading your cart…" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!cart) return null;

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon="🛒" title="Your cart is empty"
        body="Browse the store and add a few things."
        action={<Link className="btn btn-primary" style={{ display: 'inline-flex' }} to="/">Start shopping</Link>}
      />
    );
  }

  const freeShippingGap = cart.freeShippingThresholdCents - cart.subtotalCents;

  return (
    <div>
      <h1>Cart</h1>
      {update.error && <p className="field-error" role="alert">{(update.error as ApiClientError).message}</p>}
      {remove.error && <p className="field-error" role="alert">{(remove.error as ApiClientError).message}</p>}

      <div className="card card-pad">
        {cart.lines.map((line) => (
          <div className="cart-line" key={line.skuId}>
            {line.unavailable ? (
              <>
                <div className="pimg pimg-sm" style={{ background: 'var(--surface-2)' }}><span className="glyph" aria-hidden="true">❓</span></div>
                <div className="grow">
                  <strong>This item is no longer available</strong>
                  <div className="small muted">SKU {line.skuId} — remove it to continue.</div>
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => remove.mutate(line.skuId)}>Remove</Button>
                </div>
              </>
            ) : (
              <>
                <Link to={`/products/${line.slug}`} aria-label={line.productName}>
                  <ProductImage glyph={line.imageGlyph!} hue={line.imageHue!} size="sm" alt={line.productName!} />
                </Link>
                <div className="grow">
                  <div className="row-between wrap" style={{ gap: 4 }}>
                    <div>
                      <Link to={`/products/${line.slug}`}><strong>{line.productName}</strong></Link>
                      <div className="small muted">{line.optionSummary || line.packSize} · {line.skuCode}</div>
                    </div>
                    <Price cents={line.lineTotalCents!} previousCents={line.previousPriceCents} sale={line.saleApplied} member={line.memberPriceApplied} />
                  </div>
                  <div className="row-between mt-2 wrap">
                    <Stepper
                      ariaLabel={`${line.productName} quantity`}
                      quantity={line.quantity}
                      max={Math.max(line.available ?? 99, 1)}
                      onChange={(q) => update.mutate({ skuId: line.skuId, quantity: q })}
                      onRemove={() => remove.mutate(line.skuId)}
                    />
                    <div className="small muted">
                      {line.earnCoins ? <span className="coins-chip">🪙 earn {line.earnCoins}</span> : null}
                      {!line.inStock && <Badge tone="danger">Out of stock</Badge>}
                      {line.lowStock && line.inStock && <Badge tone="warn">Only {line.available} left</Badge>}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}

        <div className="summary-rows mt-4">
          <div><span>Subtotal</span><Price cents={cart.subtotalCents} /></div>
          <div className="small muted">
            <span>Delivery (sample)</span>
            <span>{cart.subtotalCents >= cart.freeShippingThresholdCents ? 'FREE' : formatAud(cart.shippingFlatCents)}</span>
          </div>
          {freeShippingGap > 0 && (
            <div className="small">
              <span className="muted">Spend {formatAud(freeShippingGap)} more for free delivery</span>
            </div>
          )}
          <div className="small muted"><span>GST included in prices (sample classification)</span></div>
        </div>

        <div className="sticky-bar mt-4">
          <Button block onClick={() => navigate('/checkout')}>Checkout · {formatAud(cart.subtotalCents + (cart.subtotalCents >= cart.freeShippingThresholdCents ? 0 : cart.shippingFlatCents))}</Button>
          <p className="small muted mt-2 mb-0" style={{ textAlign: 'center' }}>Adding to cart doesn’t reserve stock — stock is held for 15 minutes once you start payment.</p>
        </div>
      </div>
    </div>
  );
}

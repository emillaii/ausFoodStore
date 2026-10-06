import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import type { ProductView } from '../lib/types';
import { ProductGrid } from '../components/ProductCard';
import { Badge, Button, ErrorState, Loading, Price, ProductImage, Stepper } from '@aus/ui';
import { formatAud } from '@aus/contracts';

export default function ProductDetail() {
  const { slug } = useParams();
  const qc = useQueryClient();
  const { data: product, isLoading, error, refetch } = useQuery<ProductView>({
    queryKey: ['product', slug],
    queryFn: () => api.product(slug!),
  });

  const [skuId, setSkuId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const chosen = product?.skus.find((s) => s.id === (skuId ?? (product.skus.length === 1 ? product.skus[0].id : null))) ?? null;
  const cart = useQuery<{ lines: { skuId: string; quantity: number; unavailable: boolean }[] }>({ queryKey: ['cart'], queryFn: () => api.cart(), staleTime: 5_000 });
  const cartQty = cart.data?.lines.find((l) => l.skuId === chosen?.id && !l.unavailable)?.quantity ?? 0;

  const add = useMutation({
    mutationFn: (p: { skuId: string; quantity: number }) => api.addToCart(p.skuId, p.quantity),
    onSuccess: () => {
      setFeedback({ ok: true, message: 'Added to cart.' });
      qc.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (e) => setFeedback({ ok: false, message: (e as ApiClientError).message }),
  });

  if (isLoading) return <Loading label="Loading product…" />;
  if (error) return <ErrorState title="Product unavailable" error={error} onRetry={() => refetch()} />;
  if (!product) return <ErrorState error="Not found." />;

  const noVariantChosen = !chosen;
  const outOfStock = !!chosen && chosen.available <= 0;
  const earnCoins = chosen ? Math.floor((chosen.effectivePrice.unitPriceCents * qty) / 100) : 0;

  return (
    <div>
      <nav className="small muted" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {product.category && (<> › <Link to={`/categories/${product.category.slug}`}>{product.category.name}</Link></>)}
        <> › {product.name}</>
      </nav>

      <div className="pdp mt-4">
        <div>
          <ProductImage glyph={product.imageGlyph} hue={product.imageHue} size="lg" alt={`${product.name} product image`} />
          <div className="row mt-2" style={{ gap: 8 }}>
            <ProductImage glyph={product.imageGlyph} hue={product.imageHue} size="sm" alt="" />
            <ProductImage glyph={product.imageGlyph} hue={(product.imageHue + 40) % 360} size="sm" alt="" />
            <ProductImage glyph={product.imageGlyph} hue={(product.imageHue + 80) % 360} size="sm" alt="" />
          </div>
        </div>

        <div>
          {product.brand && <p className="muted small mb-0">{product.brand}</p>}
          <h1>{product.name}</h1>

          {product.skus.length > 1 && (
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
              <legend className="field-label">Choose an option</legend>
              <div className="stack" role="radiogroup" aria-label="Variants">
                {product.skus.map((s) => (
                  <button
                    key={s.id}
                    className={`opt-card ${(skuId ?? (product.skus.length === 1 ? product.skus[0].id : null)) === s.id ? 'on' : ''}`}
                    role="radio"
                    aria-checked={(skuId ?? (product.skus.length === 1 ? product.skus[0].id : null)) === s.id}
                    disabled={s.available <= 0}
                    onClick={() => { setSkuId(s.id); setQty(1); setFeedback(null); }}
                  >
                    <div className="grow">
                      <div className="row-between">
                        <strong>{Object.values(s.optionValues).join(' / ') || s.packSize || s.code}</strong>
                        <Price cents={s.effectivePrice.unitPriceCents} previousCents={s.effectivePrice.previousPriceCents} sale={s.effectivePrice.saleApplied} member={s.effectivePrice.memberPriceApplied} />
                      </div>
                      <span className="small muted">{s.available <= 0 ? 'Out of stock' : s.lowStock ? `Only ${s.available} left` : 'In stock'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {chosen && (
            <>
              <div className="row" style={{ gap: 10 }}>
                <Price
                  cents={chosen.effectivePrice.unitPriceCents}
                  previousCents={chosen.effectivePrice.previousPriceCents}
                  sale={chosen.effectivePrice.saleApplied}
                  member={chosen.effectivePrice.memberPriceApplied}
                />
                {chosen.packSize && <span className="muted small">{chosen.packSize}</span>}
              </div>
              <div className="mt-2">
                {chosen.effectivePrice.saleApplied && <Badge tone="sale">Special offer</Badge>}{' '}
                {chosen.effectivePrice.memberPriceApplied && <Badge tone="loyalty">Member price</Badge>}{' '}
                {outOfStock
                  ? <Badge tone="danger">Out of stock</Badge>
                  : chosen.lowStock ? <Badge tone="warn">Only {chosen.available} left</Badge> : <Badge tone="success">In stock</Badge>}
              </div>
              <p className="coins-chip mt-2">🪙 Earn ~{earnCoins} coins on this order (sample rule)</p>
            </>
          )}

          <p className="mt-4">{product.description}</p>

          {product.specs.length > 0 && (
            <>
              <h3 className="mt-4">Specifications</h3>
              <table className="tbl" style={{ maxWidth: 480 }}>
                <tbody>
                  {product.specs.map((s) => (
                    <tr key={s.label}><th scope="row" style={{ width: '40%' }}>{s.label}</th><td>{s.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3 className="mt-4">Delivery</h3>
          <p className="small muted mb-0">
            Flat {formatAud(990)} under {formatAud(7500)} (sample rates) · dispatched from our Sydney warehouse ·
            tracking entered manually. See <Link to="/policies/delivery">delivery policy</Link>.
          </p>

          <div className="pdp-buy">
            <div className="row-between wrap">
              {chosen && !outOfStock && (
                <Stepper
                  ariaLabel={`Quantity of ${product.name}`}
                  quantity={qty}
                  max={Math.max(chosen.available, 1)}
                  onChange={setQty}
                />
              )}
              <Button
                disabled={outOfStock || noVariantChosen}
                loading={add.isPending}
                onClick={() => chosen && add.mutate({ skuId: chosen.id, quantity: cartQty > 0 ? cartQty + qty : qty })}
                block
              >
                {noVariantChosen
                  ? 'Choose an option'
                  : outOfStock
                    ? 'Out of stock'
                    : cartQty > 0
                      ? `Add ${qty} more · ${formatAud((chosen?.effectivePrice.unitPriceCents ?? 0) * qty)}`
                      : `Add to cart · ${formatAud((chosen?.effectivePrice.unitPriceCents ?? 0) * qty)}`}
              </Button>
            </div>
            {feedback && (
              <p className={`small mt-2 mb-0 ${feedback.ok ? 'price' : 'field-error'}`} role={feedback.ok ? 'status' : 'alert'}>
                {feedback.ok ? '✓ ' : ''}{feedback.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {product.related && product.related.length > 0 && (
        <>
          <section className="section-title"><h2>Related products</h2></section>
          <ProductGrid products={product.related} />
        </>
      )}
    </div>
  );
}

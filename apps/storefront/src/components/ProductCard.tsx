import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClientError } from '@aus/commerce-client';
import { api } from '../lib/api';
import type { CartLineAvailable, CartView, ProductView } from '../lib/types';
import { Badge, Button, Modal, Price, ProductImage, Stepper } from '@aus/ui';
import { formatAud } from '@aus/contracts';

/** Quick-add control: single-SKU adds directly; multi-SKU opens an accessible variant selector. */
export function QuickAdd({ product, compact }: { product: ProductView; compact?: boolean }) {
  const qc = useQueryClient();
  const [variantOpen, setVariantOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(product.skus.length === 1 ? product.skus[0].id : null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const inCart = useQuery<CartView>({
    queryKey: ['cart'],
    queryFn: () => api.cart(),
    staleTime: 10_000,
  });
  const cartLine = inCart.data?.lines.find((l): l is CartLineAvailable => l.skuId === chosen && !l.unavailable);
  const sku = product.skus.find((s) => s.id === chosen);

  const add = useMutation({
    mutationFn: (params: { skuId: string; quantity: number; replace?: boolean }) =>
      params.replace ? api.setCartQuantity(params.skuId, params.quantity) : api.addToCart(params.skuId, params.quantity),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['cart'] }); },
    onError: (e) => setError((e as ApiClientError).message),
  });

  const available = sku?.available ?? 0;
  const outOfStock = available <= 0;

  if (!sku) {
    // variant selection required (or unavailable product)
    return (
      <>
        <Button size={compact ? 'sm' : undefined} variant="secondary" disabled={outOfStock && product.skus.every((s) => s.available <= 0)} onClick={() => setVariantOpen(true)}>
          {outOfStock && product.skus.every((s) => s.available <= 0) ? 'Out of stock' : 'Choose options'}
        </Button>
        <VariantModal
          open={variantOpen} onClose={() => setVariantOpen(false)} product={product}
          onPick={(skuId) => { setChosen(skuId); setQty(1); }}
          chosen={chosen} qty={qty} setQty={setQty} error={error}
          onAdd={(skuId, quantity, replace) => add.mutateAsync({ skuId, quantity, replace }).then(() => setVariantOpen(false))}
          adding={add.isPending}
          inCartQty={inCart.data?.lines.find((l) => l.skuId === chosen)?.quantity ?? 0}
        />
      </>
    );
  }

  if (outOfStock) {
    return <Button size={compact ? 'sm' : undefined} variant="secondary" disabled>Out of stock</Button>;
  }

  if (cartLine && cartLine.quantity > 0) {
    return (
      <>
        <Stepper
          ariaLabel={`${product.name} quantity`}
          quantity={cartLine.quantity}
          max={Math.max(cartLine.available, 1)}
          onRemove={() => add.mutate({ skuId: sku.id, quantity: 0, replace: true })}
          onChange={(q) => add.mutate({ skuId: sku.id, quantity: q, replace: true })}
        />
      </>
    );
  }

  return (
    <>
      <Button
        size={compact ? 'sm' : undefined}
        aria-label={`Add ${product.name} to cart`}
        loading={add.isPending}
        onClick={() => add.mutate({ skuId: sku.id, quantity: qty })}
      >
        Add
      </Button>
      {error && <div className="field-error" role="alert">{error}</div>}
    </>
  );
}

function VariantModal({
  open, onClose, product, onPick, chosen, qty, setQty, onAdd, adding, error, inCartQty,
}: {
  open: boolean; onClose: () => void; product: ProductView;
  onPick: (skuId: string) => void; chosen: string | null; qty: number; setQty: (q: number) => void;
  onAdd: (skuId: string, quantity: number, replace?: boolean) => Promise<void>;
  adding: boolean; error: string | null; inCartQty: number;
}) {
  const sku = product.skus.find((s) => s.id === chosen) ?? null;
  return (
    <Modal open={open} onClose={onClose} title={`Choose options — ${product.name}`}>
      <div className="stack" role="radiogroup" aria-label="Available variants">
        {product.skus.map((s) => {
          const on = s.id === chosen;
          return (
            <button
              key={s.id}
              className={`opt-card ${on ? 'on' : ''}`}
              role="radio" aria-checked={on}
              disabled={s.available <= 0}
              onClick={() => onPick(s.id)}
            >
              <div className="grow">
                <div className="row-between">
                  <strong>{Object.values(s.optionValues).join(' / ') || s.packSize || s.code}</strong>
                  <Price cents={s.effectivePrice.unitPriceCents} previousCents={s.effectivePrice.previousPriceCents} sale={s.effectivePrice.saleApplied} member={s.effectivePrice.memberPriceApplied} />
                </div>
                <div className="small muted">
                  {s.available <= 0 ? 'Out of stock' : s.lowStock ? `Only ${s.available} left` : 'In stock'}
                  {s.effectivePrice.saleApplied && <> · <Badge tone="sale">Special</Badge></>}
                  {s.effectivePrice.memberPriceApplied && <> · <Badge tone="loyalty">Member price</Badge></>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {sku && (
        <div className="mt-4">
          <div className="row-between">
            <Stepper ariaLabel={`Quantity of ${product.name}`} quantity={qty} max={Math.max(sku.available, 1)} onChange={setQty} />
            <div>
              <span className="muted small">Subtotal </span>
              <Price cents={sku.effectivePrice.unitPriceCents * qty} />
            </div>
          </div>
          {error && <div className="field-error mt-2" role="alert">{error}</div>}
          <Button
            block className="mt-4"
            loading={adding}
            onClick={() => onAdd(sku.id, inCartQty > 0 ? inCartQty + qty : qty)}
          >
            {inCartQty > 0 ? `Add ${qty} more (${inCartQty} in cart)` : `Add to cart · ${formatAud(sku.effectivePrice.unitPriceCents * qty)}`}
          </Button>
        </div>
      )}
    </Modal>
  );
}

export function ProductCard({ product, showAdd = true }: { product: ProductView; showAdd?: boolean }) {
  const primary = product.skus[0];
  const anyStock = product.skus.some((s) => s.available > 0);
  const sale = primary?.effectivePrice.saleApplied;
  const member = primary?.effectivePrice.memberPriceApplied;
  const low = primary?.lowStock;
  return (
    <div className="pcard">
      <div style={{ position: 'relative' }}>
        {sale && <span className="pcard-flag"><Badge tone="sale">Special</Badge></span>}
        {!sale && member && <span className="pcard-flag"><Badge tone="loyalty">Member</Badge></span>}
        <Link to={`/products/${product.slug}`} aria-label={product.name}>
          <ProductImage glyph={product.imageGlyph} hue={product.imageHue} size="lg" alt={product.name} />
        </Link>
      </div>
      <div className="pcard-body">
        {product.brand && <span className="xsmall muted">{product.brand}</span>}
        <Link className="pcard-name" to={`/products/${product.slug}`}>{product.name}</Link>
        <span className="pcard-pack">{primary?.packSize ?? Object.values(primary?.optionValues ?? {}).join(' / ')}</span>
        {primary && (
          <div>
            <Price
              cents={primary.effectivePrice.unitPriceCents}
              previousCents={primary.effectivePrice.previousPriceCents}
              sale={sale} member={member}
            />
            <div className="coins-chip xsmall">🪙 earn {Math.floor(primary.effectivePrice.unitPriceCents / 100)}</div>
          </div>
        )}
        <div className="pcard-foot">
          {low && <span className="badge badge-warn">Low stock</span>}
          {!anyStock && <span className="badge badge-neutral">Out of stock</span>}
          {showAdd && anyStock && <div style={{ marginLeft: 'auto' }}><QuickAdd product={product} compact /></div>}
        </div>
      </div>
    </div>
  );
}

export function ProductGrid({ products, showAdd = true }: { products: ProductView[]; showAdd?: boolean }) {
  if (products.length === 0) return null;
  return (
    <div className="prod-grid">
      {products.map((p) => <ProductCard key={p.id} product={p} showAdd={showAdd} />)}
    </div>
  );
}

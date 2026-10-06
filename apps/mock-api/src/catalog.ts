import type { Express } from 'express';
import { db, persist } from './db';
import { fail, getAuth, int, ok, ownerKeyOf, str, nowIso } from './http';
import { availableOf, findProductBySlug, findSku, invOf, publicProduct } from './domain';
import { getEffectivePrice, isSaleActive } from '@aus/contracts';
import type { CartLine, Customer } from '@aus/contracts';

const MAX_QTY = 99;

export function registerCatalogRoutes(app: Express): void {
  // ------------------------------------------------------------- home page
  app.get('/home', (req, res) => {
    const auth = getAuth(req);
    const active = db.products.filter((p) => p.status === 'ACTIVE');
    const withPrimary = active.map((p) => ({ product: p, sku: p.skus.find((s) => s.active) })).filter((x) => x.sku);

    const deals = withPrimary
      .filter(({ sku }) => isSaleActive(sku!))
      .slice(0, 8)
      .map(({ product }) => publicProduct(product, auth.customer));
    const memberSpecials = auth.customer?.member
      ? withPrimary
          .filter(({ sku }) => !isSaleActive(sku!) && sku!.memberPriceCents != null && sku!.memberPriceCents! < sku!.priceCents)
          .slice(0, 8)
          .map(({ product }) => publicProduct(product, auth.customer))
      : [];
    // "Popular" = most units across seeded orders (deterministic stand-in for analytics).
    const units: Record<string, number> = {};
    for (const o of db.orders) for (const l of o.lines) units[l.skuId] = (units[l.skuId] ?? 0) + l.quantity;
    const popular = withPrimary
      .sort((a, b) => (units[b.sku!.id] ?? 0) - (units[a.sku!.id] ?? 0))
      .slice(0, 8)
      .map(({ product }) => publicProduct(product, auth.customer));
    const isNew = [...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8)
      .map((p) => publicProduct(p, auth.customer));

    ok(res, {
      storeName: db.settings.storeName,
      tagline: db.settings.tagline,
      banners: db.banners.filter((b) => b.active).sort((a, b) => a.displayOrder - b.displayOrder),
      topCategories: db.categories.filter((c) => c.parentId === null && c.active).sort((a, b) => a.displayOrder - b.displayOrder),
      deals, memberSpecials, popular, isNew,
      freeShippingThresholdCents: db.settings.freeShippingThresholdCents,
    });
  });

  // ------------------------------------------------------------- categories
  app.get('/categories', (req, res) => {
    ok(res, db.categories.filter((c) => c.active).sort((a, b) => a.displayOrder - b.displayOrder));
  });

  // ------------------------------------------------------------- product search / listing
  app.get('/products', (req, res) => {
    const auth = getAuth(req);
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const categorySlug = req.query.category ? String(req.query.category) : undefined;
    const brand = req.query.brand ? String(req.query.brand) : undefined;
    const inStock = req.query.inStock === '1' || req.query.inStock === 'true';
    const onSale = req.query.sale === '1';
    const sort = String(req.query.sort ?? 'relevance');
    const page = Math.max(1, int(req.query.page, 'Page', { min: 1 }) ?? 1);
    const pageSize = Math.min(48, int(req.query.pageSize, 'Page size', { min: 1 }) ?? 24);

    let categoryIds: string[] | null = null;
    if (categorySlug) {
      const cat = db.categories.find((c) => c.slug === categorySlug && c.active);
      if (!cat) fail(404, 'NOT_FOUND', 'Category not found.');
      const children = db.categories.filter((c) => c.parentId === cat.id).map((c) => c.id);
      categoryIds = [cat.id, ...children];
    }

    let items = db.products.filter((p) => p.status === 'ACTIVE');
    if (categoryIds) items = items.filter((p) => p.categoryIds.some((id) => categoryIds!.includes(id)));
    if (brand) items = items.filter((p) => p.brand?.toLowerCase() === brand.toLowerCase());
    if (q) {
      items = items.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.skus.some((s) => s.code.toLowerCase().includes(q)),
      );
    }
    let views = items.map((p) => publicProduct(p, auth.customer));
    if (inStock) views = views.filter((v) => v.skus.some((s) => s.available > 0));
    if (onSale) views = views.filter((v) => v.skus.some((s) => s.effectivePrice.saleApplied));

    const firstPrice = (v: ReturnType<typeof publicProduct>) => v.skus[0]?.effectivePrice.unitPriceCents ?? 0;
    if (sort === 'price-asc') views.sort((a, b) => firstPrice(a) - firstPrice(b));
    else if (sort === 'price-desc') views.sort((a, b) => firstPrice(b) - firstPrice(a));
    else if (sort === 'newest') views.sort((a, b) => 0); // stable: seed order by createdAt below
    if (sort === 'newest') {
      const byCreated = new Map(db.products.map((p, i) => [p.id, i]));
      views.sort((a, b) => (byCreated.get(b.id) ?? 0) - (byCreated.get(a.id) ?? 0));
    }

    const brands = [...new Set(db.products.filter((p) => p.status === 'ACTIVE').map((p) => p.brand).filter(Boolean))] as string[];
    const total = views.length;
    const pageItems = views.slice((page - 1) * pageSize, page * pageSize);
    ok(res, { items: pageItems, total, page, pageSize, brands, category: categorySlug ?? null, sort });
  });

  app.get('/search/suggestions', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) return ok(res, { products: [], categories: [] });
    const products = db.products
      .filter((p) => p.status === 'ACTIVE' && (p.name.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q)))
      .slice(0, 6)
      .map((p) => ({ slug: p.slug, name: p.name, brand: p.brand, glyph: p.imageGlyph, hue: p.imageHue }));
    const categories = db.categories
      .filter((c) => c.active && c.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map((c) => ({ slug: c.slug, name: c.name }));
    ok(res, { products, categories });
  });

  app.get('/products/:slug', (req, res) => {
    const auth = getAuth(req);
    const product = findProductBySlug(req.params.slug);
    if (!product || product.status !== 'ACTIVE') fail(404, 'NOT_FOUND', 'Product not found or unavailable.');
    const view = publicProduct(product, auth.customer);
    const related = db.products
      .filter((p) => p.status === 'ACTIVE' && p.id !== product.id && p.categoryIds.some((c) => product.categoryIds.includes(c)))
      .slice(0, 4)
      .map((p) => publicProduct(p, auth.customer));
    const category = db.categories.find((c) => product.categoryIds.includes(c.id));
    ok(res, { ...view, related, category: category ? { slug: category.slug, name: category.name } : null });
  });

  // ------------------------------------------------------------- cart
  app.get('/cart', (req, res) => {
    const auth = getAuth(req);
    const ownerKey = ownerKeyOf(auth);
    ok(res, buildCartView(ownerKey, auth.customer));
  });

  app.post('/cart/lines', (req, res) => {
    const auth = getAuth(req);
    const ownerKey = ownerKeyOf(auth);
    const skuId = str(req.body?.skuId, 'SKU')!;
    const quantity = int(req.body?.quantity, 'Quantity', { min: 1, max: MAX_QTY })!;
    const sku = findSku(skuId);
    if (!sku || !sku.active) fail(404, 'NOT_FOUND', 'This item is no longer available.');
    const product = db.products.find((p) => p.id === sku.productId);
    if (!product || product.status !== 'ACTIVE') fail(404, 'NOT_FOUND', 'This item is no longer available.');
    const cart = (db.carts[ownerKey] ??= { ownerKey, lines: [], version: 0, updatedAt: nowIso() });
    const existing = cart.lines.find((l) => l.skuId === skuId);
    const available = availableOf(skuId);
    const newQty = Math.min((existing?.quantity ?? 0) + quantity, MAX_QTY);
    if (newQty > available) {
      fail(409, 'STOCK_UNAVAILABLE',
        available === 0 ? 'This item is out of stock.' : `Only ${available} left in stock — quantity adjusted request declined.`,
        { skuId, available, requested: newQty });
    }
    if (existing) existing.quantity = newQty;
    else cart.lines.push({ skuId, quantity: newQty, addedAt: nowIso() });
    cart.version += 1;
    cart.updatedAt = nowIso();
    persist();
    ok(res, buildCartView(ownerKey, auth.customer));
  });

  app.put('/cart/lines/:skuId', (req, res) => {
    const auth = getAuth(req);
    const ownerKey = ownerKeyOf(auth);
    const quantity = int(req.body?.quantity, 'Quantity', { min: 0, max: MAX_QTY })!;
    const cart = (db.carts[ownerKey] ??= { ownerKey, lines: [], version: 0, updatedAt: nowIso() });
    const line = cart.lines.find((l) => l.skuId === req.params.skuId);
    if (!line) fail(404, 'NOT_FOUND', 'Cart line not found.');
    if (quantity === 0) {
      cart.lines = cart.lines.filter((l) => l.skuId !== req.params.skuId);
    } else {
      const available = availableOf(req.params.skuId);
      if (quantity > available) {
        fail(409, 'STOCK_UNAVAILABLE',
          available === 0 ? 'This item just went out of stock — remove it to continue.' : `Only ${available} available.`,
          { skuId: req.params.skuId, available, requested: quantity });
      }
      line.quantity = quantity;
    }
    cart.version += 1;
    cart.updatedAt = nowIso();
    persist();
    ok(res, buildCartView(ownerKey, auth.customer));
  });

  app.delete('/cart/lines/:skuId', (req, res) => {
    const auth = getAuth(req);
    const ownerKey = ownerKeyOf(auth);
    const cart = (db.carts[ownerKey] ??= { ownerKey, lines: [], version: 0, updatedAt: nowIso() });
    cart.lines = cart.lines.filter((l) => l.skuId !== req.params.skuId);
    cart.version += 1;
    cart.updatedAt = nowIso();
    persist();
    ok(res, buildCartView(ownerKey, auth.customer));
  });

  app.post('/cart/merge', (req, res) => {
    const customer = requireCustomerAuth(getAuth(req));
    const guestKey = req.header('x-session-key');
    if (!guestKey) return ok(res, { notes: [] });
    const notes = mergeCartsImpl(`guest:${guestKey}`, customer.id);
    ok(res, { notes, cart: buildCartView(customer.id, customer) });
  });
}

// local import to avoid circular deps at module init
import { mergeCarts as mergeCartsImpl } from './auth';
import { requireCustomer as requireCustomerAuth } from './http';
import { loyaltyBalance } from './domain';

export function buildCartView(ownerKey: string, customer?: Customer | null) {
  const cart = db.carts[ownerKey] ?? { ownerKey, lines: [] as CartLine[], version: 0, updatedAt: nowIso() };
  const lines = cart.lines.map((line) => {
    const sku = findSku(line.skuId);
    if (!sku || !sku.active) {
      return { skuId: line.skuId, quantity: line.quantity, unavailable: true as const, reason: 'no-longer-sold' };
    }
    const product = db.products.find((p) => p.id === sku.productId)!;
    const available = availableOf(sku.id);
    const price = getEffectivePrice(sku, customer ?? undefined, db.settings);
    const earnCoins = Math.floor((price.unitPriceCents * line.quantity) / 100) * db.settings.coinsPerDollar;
    return {
      skuId: line.skuId, quantity: line.quantity, unavailable: false as const,
      productId: product.id, slug: product.slug, productName: product.name,
      skuCode: sku.code, optionSummary: Object.entries(sku.optionValues).map(([k, v]) => `${k}: ${v}`).join(', ') || (sku.packSize ?? ''),
      imageGlyph: product.imageGlyph, imageHue: product.imageHue, packSize: sku.packSize,
      unitPriceCents: price.unitPriceCents, previousPriceCents: price.previousPriceCents,
      lineTotalCents: price.unitPriceCents * line.quantity,
      available, inStock: available > 0, lowStock: available > 0 && available <= invOf(sku.id).lowStockThreshold,
      earnCoins, saleApplied: price.saleApplied, memberPriceApplied: price.memberPriceApplied,
    };
  });
  const availableLines = lines.filter((l) => !l.unavailable);
  const subtotalCents = availableLines.reduce((sum, l) => sum + (l as { lineTotalCents: number }).lineTotalCents, 0);
  return {
    ownerKey, version: cart.version, lines, subtotalCents,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    coinsBalance: customer ? loyaltyBalance(customer.id) : null,
    freeShippingThresholdCents: db.settings.freeShippingThresholdCents,
    shippingFlatCents: db.settings.shippingFlatCents,
  };
}

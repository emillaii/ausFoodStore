import type {
  Address, AdminProductListResponse, ApiErrorCode, AttemptResponse, AuthResponse, Banner, BeginCheckoutResponse,
  CartView, Category, CheckoutQuoteResponse, CustomerPublic, HomeView, ListingResponse, LoyaltyResponse,
  MergeCartResponse, Order, PayResponse, ProductView, ReorderResponse, ReturnRequest, SuggestionsResponse,
} from '@aus/contracts';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode | 'NETWORK' | 'UNKNOWN',
    message: string,
    public requestId?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  baseUrl?: string;
  /** Return current auth headers (customer bearer token, guest session key, staff id). */
  getHeaders: () => Record<string, string>;
}

type Req = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export function createClient(options: ClientOptions) {
  const base = options.baseUrl ?? '/api';

  const request: Req = async (method, path, body) => {
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', ...options.getHeaders() },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiClientError(0, 'NETWORK', 'Network error — check your connection and try again.');
    }
    let json: { data?: unknown; code?: ApiErrorCode; message?: string; requestId?: string; details?: Record<string, unknown> } | null = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      throw new ApiClientError(
        res.status,
        json?.code ?? 'UNKNOWN',
        json?.message ?? `Request failed (${res.status})`,
        json?.requestId,
        json?.details,
      );
    }
    return (json?.data ?? null) as never;
  };

  const get = <T>(path: string) => request<T>('GET', path);
  const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
  const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, body);
  const del = <T>(path: string) => request<T>('DELETE', path);

  const qs = (query: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v != null && v !== '') params.set(k, String(v));
    const s = params.toString();
    return s ? `?${s}` : '';
  };

  return {
    get, post, put, del,

    home: () => get<HomeView>('/home'),
    categories: () => get<Category[]>('/categories'),
    products: (query: Record<string, string | number | undefined> = {}) => get<ListingResponse>(`/products${qs(query)}`),
    product: (slug: string) => get<ProductView>(`/products/${slug}`),
    suggestions: (q: string) => get<SuggestionsResponse>(`/search/suggestions?q=${encodeURIComponent(q)}`),

    cart: () => get<CartView>('/cart'),
    addToCart: (skuId: string, quantity: number) => post<CartView>('/cart/lines', { skuId, quantity }),
    setCartQuantity: (skuId: string, quantity: number) => put<CartView>(`/cart/lines/${skuId}`, { quantity }),
    removeCartLine: (skuId: string) => del<CartView>(`/cart/lines/${skuId}`),
    mergeCart: () => post<MergeCartResponse>('/cart/merge'),

    quoteCheckout: (body: { address?: unknown; coinRedeemed?: number }) => post<CheckoutQuoteResponse>('/checkout/quote', body),
    beginCheckout: (body: Record<string, unknown>) => post<BeginCheckoutResponse>('/checkout/attempts', body),
    checkoutAttempt: (id: string) => get<AttemptResponse>(`/checkout/attempts/${id}`),
    cancelCheckout: (id: string) => post<{ attempt: CheckoutAttemptTypes }>(`/checkout/attempts/${id}/cancel`),
    payCheckout: (id: string, outcome: 'SUCCESS' | 'FAILED' | 'PENDING') => post<PayResponse>(`/checkout/attempts/${id}/pay`, { outcome }),
    completePendingPayment: (id: string) => post<PayResponse>(`/checkout/complete-pending/${id}`),

    me: () => get<CustomerPublic>('/auth/me'),
    login: (email: string, password: string) => post<AuthResponse>('/auth/login', { email, password }),
    register: (body: Record<string, unknown>) => post<AuthResponse>('/auth/register', body),
    logout: () => post<{ ok: boolean }>('/auth/logout'),
    updateProfile: (body: Record<string, unknown>) => put<CustomerPublic>('/customers/me', body),
    requestDeletion: () => post<{ ok: boolean; message: string }>('/customers/me/deletion-request'),
    addresses: () => get<Address[]>('/customers/me/addresses'),
    createAddress: (body: Record<string, unknown>) => post<Address>('/customers/me/addresses', body),
    updateAddress: (id: string, body: Record<string, unknown>) => put<Address>(`/customers/me/addresses/${id}`, body),
    deleteAddress: (id: string) => del<{ ok: boolean }>(`/customers/me/addresses/${id}`),
    loyalty: () => get<LoyaltyResponse>('/loyalty'),

    myOrders: () => get<Order[]>('/orders'),
    order: (id: string, guestCode?: string) => get<Order>(`/orders/${id}${guestCode ? `?code=${guestCode}` : ''}`),
    guestOrderLookup: (orderNumber: string, email: string, accessCode: string) => post<Order>('/orders/guest-lookup', { orderNumber, email, accessCode }),
    reorder: (id: string) => post<ReorderResponse>(`/orders/${id}/reorder`),
    createReturn: (id: string, items: { lineId: string; quantity: number; reason: string }[]) => post<ReturnRequest>(`/orders/${id}/returns`, { items }),

    admin: {
      // Admin view endpoints intentionally return loosely-typed payloads (any):
      // each screen declares the precise shape it consumes in its useQuery generics.
      dashboard: (range?: { from?: string; to?: string }) => get<any>(`/admin/dashboard${qs(range ?? {})}`),
      permissions: () => get<{ staff: import('@aus/contracts').StaffUser; permissions: import('@aus/contracts').PermissionMatrix; roleLabels: Record<string, string> }>('/admin/permissions/me'),

      products: (query: Record<string, string | number | undefined> = {}) => get<AdminProductListResponse>(`/admin/products${qs(query)}`),
      product: (id: string) => get<any>(`/admin/products/${id}`),
      saveProduct: (body: Record<string, unknown>) => post<AdminProductTypes>('/admin/products', body),
      updateProduct: (id: string, body: Record<string, unknown>) => put<AdminProductTypes>(`/admin/products/${id}`, body),
      setProductStatus: (id: string, status: 'publish' | 'archive' | 'draft') => post<AdminProductTypes>(`/admin/products/${id}/${status}`),

      categories: () => get<any[]>('/admin/categories'),
      saveCategory: (body: Record<string, unknown>) => post<any>('/admin/categories', body),
      updateCategory: (id: string, body: Record<string, unknown>) => put<any>(`/admin/categories/${id}`, body),

      inventory: (query: Record<string, string | number | undefined> = {}) => get<any>(`/admin/inventory${qs(query)}`),
      adjustStock: (skuId: string, delta: number, reason: string, reference?: string) =>
        post<any>(`/admin/inventory/${skuId}/adjust`, { delta, reason, reference }),
      previewAdjustment: (skuId: string, delta: number) => post<any>(`/admin/inventory/${skuId}/preview`, { delta }),
      movements: (skuId: string) => get<any[]>(`/admin/inventory/${skuId}/movements`),

      orders: (query: Record<string, string | number | undefined> = {}) => get<{ items: Order[]; total: number; page: number; pageSize: number }>(`/admin/orders${qs(query)}`),
      order: (id: string) => get<Order>(`/admin/orders/${id}`),
      createManualOrder: (body: Record<string, unknown>) => post<Order>('/admin/orders', body),
      updateDraft: (id: string, body: Record<string, unknown>) => put<Order>(`/admin/orders/${id}`, body),
      issueInvoice: (id: string) => post<Order>(`/admin/orders/${id}/issue-invoice`),
      paymentLink: (id: string) => post<{ order: Order; payment: unknown; link: string }>(`/admin/orders/${id}/payment-link`),
      offlinePayment: (id: string, reference: string) => post<Order>(`/admin/orders/${id}/offline-payment`, { reference }),
      addOrderNote: (id: string, body: string) => post<unknown>(`/admin/orders/${id}/notes`, { body }),
      cancelOrder: (id: string) => post<Order>(`/admin/orders/${id}/cancel`),

      fulfilmentQueue: () => get<Order[]>('/admin/fulfilment/queue'),
      startPicking: (id: string) => post<Order>(`/admin/orders/${id}/start-picking`),
      pick: (id: string, lineId: string, quantity: number) => post<Order>(`/admin/orders/${id}/pick`, { lineId, quantity }),
      resolveException: (id: string, lineId: string, action: 'cancel-remaining' | 'mark-picked') =>
        post<Order>(`/admin/orders/${id}/exception/${lineId}/resolve`, { action }),
      pack: (id: string) => post<Order>(`/admin/orders/${id}/pack`),
      createShipment: (id: string, body: Record<string, unknown>) => post<Order>(`/admin/orders/${id}/shipments`, body),
      dispatch: (id: string, shipId: string) => post<{ order: Order; duplicate: boolean }>(`/admin/orders/${id}/shipments/${shipId}/dispatch`),
      cancelShipment: (id: string, shipId: string) => post<Order>(`/admin/orders/${id}/shipments/${shipId}/cancel`),

      customers: (q?: string) => get<any>(`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
      customer: (id: string) => get<any>(`/admin/customers/${id}`),
      addCustomerNote: (id: string, body: string) => post<any>(`/admin/customers/${id}/notes`, { body }),
      adjustCoins: (customerId: string, coins: number, reason: string) => post<any>(`/admin/loyalty/${customerId}/adjust`, { coins, reason }),

      returns: (status?: string) => get<any>(`/admin/returns${status ? `?status=${status}` : ''}`),
      decideReturn: (returnId: string, body: Record<string, unknown>) => post<any>(`/admin/returns/${returnId}/decision`, body),

      documents: (type?: string) => get<any>(`/admin/documents${type ? `?type=${type}` : ''}`),
      document: (id: string) => get<any>(`/admin/documents/${id}`),
      issueDocument: (orderId: string, type: string) => post<any>(`/admin/orders/${orderId}/documents`, { type }),

      promotions: () => get<any>('/admin/promotions'),
      createPromotion: (body: Record<string, unknown>) => post<any>('/admin/promotions', body),
      deletePromotion: (id: string) => del<{ ok: boolean }>(`/admin/promotions/${id}`),
      createBanner: (body: Record<string, unknown>) => post<any>('/admin/banners', body),
      updateBanner: (id: string, body: Record<string, unknown>) => put<Banner>(`/admin/banners/${id}`, body),

      report: (type: string, range?: { from?: string; to?: string }) =>
        get<{ columns: string[]; rows: { label: string; values: Record<string, number | string> }[] }>(`/admin/reports/${type}${qs(range ?? {})}`),

      settings: () => get<any>('/admin/settings'),
      updateSettings: (body: Record<string, unknown>) => put<any>('/admin/settings', body),
      updateStaff: (id: string, body: Record<string, unknown>) => put<any>(`/admin/staff/${id}`, body),
      audit: () => get<any[]>('/admin/audit'),
    },

    demo: {
      info: () => get<any>('/demo/info'),
      reset: () => post<{ reset: boolean }>('/demo/reset'),
      stateSummary: () => get<{ orders: number; attempts: { id: string; status: string; expires?: string }[]; finalUnitSku: string; truffleOil: unknown }>('/demo/state-summary'),
    },
  };
}

export type CommerceClient = ReturnType<typeof createClient>;

// Local aliases to avoid importing model types twice in the same statement block.
type CheckoutAttemptTypes = import('@aus/contracts').CheckoutAttempt;
type AdminProductTypes = import('@aus/contracts').Product;

import type { PermissionMatrix, Role } from './models';

/**
 * DRAFT demo permission matrix (brief §7.6). Production permissions must come
 * from the API per request; this matrix is enforced server-side in the mock API
 * and only mirrored in the admin UI for display.
 */
export const PERMISSION_MATRIX: Record<Role, PermissionMatrix> = {
  ADMIN: {
    products: true, categories: true, inventoryAdjust: true, orders: true, manualOrders: true,
    fulfilment: true, customers: true, returns: true, refundExecution: true, documents: true,
    promotions: true, loyaltyAdjust: true, reports: true, settings: true, staff: true, audit: true,
  },
  ORDER_STAFF: {
    products: false, categories: false, inventoryAdjust: false, orders: true, manualOrders: true,
    fulfilment: false, customers: true, returns: true, refundExecution: false, documents: true,
    promotions: false, loyaltyAdjust: false, reports: false, settings: false, staff: false, audit: false,
  },
  WAREHOUSE: {
    products: false, categories: false, inventoryAdjust: false, orders: false, manualOrders: false,
    fulfilment: true, customers: false, returns: false, refundExecution: false, documents: true,
    promotions: false, loyaltyAdjust: false, reports: false, settings: false, staff: false, audit: false,
  },
  CUSTOMER_SERVICE: {
    products: false, categories: false, inventoryAdjust: false, orders: true, manualOrders: false,
    fulfilment: false, customers: true, returns: true, refundExecution: false, documents: true,
    promotions: false, loyaltyAdjust: false, reports: false, settings: false, staff: false, audit: false,
  },
  FINANCE: {
    products: false, categories: false, inventoryAdjust: false, orders: true, manualOrders: false,
    fulfilment: false, customers: true, returns: true, refundExecution: true, documents: true,
    promotions: false, loyaltyAdjust: false, reports: true, settings: false, staff: false, audit: true,
  },
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  ORDER_STAFF: 'Order staff',
  WAREHOUSE: 'Warehouse',
  CUSTOMER_SERVICE: 'Customer service',
  FINANCE: 'Finance',
};

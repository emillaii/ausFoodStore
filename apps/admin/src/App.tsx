import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { PermissionMatrix } from '@aus/contracts';
import { Shell, Denied } from './components/Shell';
import { useStaff } from './lib/staff';
import { Loading } from '@aus/ui';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import ManualOrder from './pages/ManualOrder';
import Fulfilment from './pages/Fulfilment';
import Customers from './pages/Customers';
import Returns from './pages/Returns';
import Documents from './pages/Documents';
import Promotions from './pages/Promotions';
import Loyalty from './pages/Loyalty';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

function Guard({ perm, children }: { perm: keyof PermissionMatrix; children: React.ReactNode }) {
  const { loading, staff, can } = useStaff();
  if (loading) return <Loading label="Checking permissions…" />;
  if (!staff) return <Denied permission="any — pick a staff identity in the role switcher" />;
  if (!can(perm)) return <Denied permission={perm} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Guard perm="orders"><Dashboard /></Guard>} />
        <Route path="/products" element={<Guard perm="products"><Products /></Guard>} />
        <Route path="/products/new" element={<Guard perm="products"><Products editorMode="new" /></Guard>} />
        <Route path="/products/:id" element={<Guard perm="products"><Products editorMode="edit" /></Guard>} />
        <Route path="/categories" element={<Guard perm="categories"><Categories /></Guard>} />
        <Route path="/inventory" element={<Guard perm="orders"><Inventory /></Guard>} />
        <Route path="/orders" element={<Guard perm="orders"><Orders /></Guard>} />
        <Route path="/orders/new" element={<Guard perm="manualOrders"><ManualOrder /></Guard>} />
        <Route path="/orders/:id" element={<Guard perm="orders"><OrderDetail /></Guard>} />
        <Route path="/fulfilment" element={<Guard perm="fulfilment"><Fulfilment /></Guard>} />
        <Route path="/fulfilment/:id" element={<Guard perm="fulfilment"><Fulfilment focus /></Guard>} />
        <Route path="/customers" element={<Guard perm="customers"><Customers /></Guard>} />
        <Route path="/returns" element={<Guard perm="returns"><Returns /></Guard>} />
        <Route path="/documents" element={<Guard perm="documents"><Documents /></Guard>} />
        <Route path="/promotions" element={<Guard perm="promotions"><Promotions /></Guard>} />
        <Route path="/loyalty" element={<Guard perm="customers"><Loyalty /></Guard>} />
        <Route path="/reports" element={<Guard perm="reports"><Reports /></Guard>} />
        <Route path="/settings" element={<Guard perm="settings"><Settings /></Guard>} />
        <Route path="*" element={<Denied permission="route" />} />
      </Routes>
    </Shell>
  );
}

import React, { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Header, BottomNav } from './components/Header';
import { useSessionWarm } from './lib/auth';
import Home from './pages/Home';
import Categories from './pages/Categories';
import CategoryListing from './pages/CategoryListing';
import Search from './pages/Search';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import CheckoutResult from './pages/CheckoutResult';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Account from './pages/Account';
import AccountOrders from './pages/AccountOrders';
import AccountOrderDetail from './pages/AccountOrderDetail';
import AccountAddresses from './pages/AccountAddresses';
import AccountLoyalty from './pages/AccountLoyalty';
import AccountSettings from './pages/AccountSettings';
import Help from './pages/Help';
import Policy from './pages/Policy';
import OrderLookup from './pages/OrderLookup';
import NotFound from './pages/NotFound';
import Footer from './components/Footer';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  useSessionWarm();
  return (
    <div className="app">
      <ScrollToTop />
      <Header />
      <main className="main" id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/categories/:slug" element={<CategoryListing />} />
          <Route path="/search" element={<Search />} />
          <Route path="/products/:slug" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/checkout/result/:id" element={<CheckoutResult />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/orders" element={<AccountOrders />} />
          <Route path="/account/orders/:id" element={<AccountOrderDetail />} />
          <Route path="/account/addresses" element={<AccountAddresses />} />
          <Route path="/account/loyalty" element={<AccountLoyalty />} />
          <Route path="/account/settings" element={<AccountSettings />} />
          <Route path="/help" element={<Help />} />
          <Route path="/policies/:slug" element={<Policy />} />
          <Route path="/order-lookup" element={<OrderLookup />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}

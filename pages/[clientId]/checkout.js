// pages/[clientId]/checkout.js
// Checkout page — review cart, enter delivery address, choose payment, place order.
//
// Flow:
//   1. Guard: if cart is empty → redirect back to menu
//   2. Show order summary (items, subtotal)
//   3. Collect: name, phone, delivery address
//   4. Payment method: COD (CASH) or UPI
//   5. Place Order → POST /api/orders
//   6. Success → clear cart → navigate to /[clientId]/order-success?orderId=...&orderNo=...
//
// The session (delivery_session cookie) carries { email, name, phone }.
// We pre-fill name/phone from the session to avoid re-entry, but let the
// user edit them (name/phone on the order itself is just informational —
// stored in description on the backend).

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  FiArrowLeft, FiMapPin, FiUser, FiPhone,
  FiDollarSign, FiSmartphone, FiCheck, FiAlertCircle,
} from 'react-icons/fi';
import { apiFetch } from '@/lib/api';
import { useCart } from '@/components/CartContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0,
  }).format(amount);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
      <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}

function InputField({ icon: Icon, label, value, onChange, placeholder, type = 'text', rows }) {
  const isTextarea = rows !== undefined;
  return (
    <div className="mb-3 last:mb-0">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 mb-1">
        {Icon && <Icon size={12} />}
        {label}
      </label>
      {isTextarea ? (
        <textarea
          rows={rows}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition"
        />
      )}
    </div>
  );
}

function PaymentOption({ id, label, description, icon: Icon, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={[
        'flex items-center gap-3 w-full p-3 rounded-xl border-2 transition-colors text-left',
        selected
          ? 'border-brand-orange bg-orange-50'
          : 'border-stone-100 bg-white',
      ].join(' ')}
    >
      <div className={[
        'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
        selected ? 'bg-brand-orange text-white' : 'bg-stone-100 text-stone-400',
      ].join(' ')}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${selected ? 'text-brand-orange' : 'text-stone-800'}`}>
          {label}
        </p>
        <p className="text-xs text-stone-400">{description}</p>
      </div>
      {selected && (
        <FiCheck size={16} className="text-brand-orange flex-shrink-0" />
      )}
    </button>
  );
}

function CartLineItem({ item, onIncrease, onDecrease }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-stone-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 truncate">{item.name}</p>
        <p className="text-xs text-stone-400 mt-0.5">{formatPrice(item.price)} each</p>
      </div>
      {/* Inline qty stepper */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onDecrease(item)}
          className="w-7 h-7 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center text-lg font-bold leading-none active:bg-stone-200"
        >
          −
        </button>
        <span className="text-sm font-bold text-stone-900 w-5 text-center">
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={() => onIncrease(item)}
          className="w-7 h-7 rounded-full bg-brand-orange text-white flex items-center justify-center text-lg font-bold leading-none active:scale-95"
        >
          +
        </button>
      </div>
      <p className="text-sm font-bold text-stone-900 w-16 text-right flex-shrink-0">
        {formatPrice(item.price * item.quantity)}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const router = useRouter();
  const { clientId } = router.query;

  const {
    clientName, items, totalAmount, totalItems,
    updateQty, clearCart,
  } = useCart();

  // ── Form state ──────────────────────────────────────────────────────────
  const [name,            setName]            = useState('');
  const [phone,           setPhone]           = useState('');
  const [address,         setAddress]         = useState('');
  const [paymentMethod,   setPaymentMethod]   = useState('CASH');

  // ── Submission state ────────────────────────────────────────────────────
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState(null);

  // ── Pre-fill name/phone from sessionStorage (set by login page) ─────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('delivery_user');
      if (raw) {
        const user = JSON.parse(raw);
        if (user.name)  setName(user.name);
        if (user.phone) setPhone(user.phone);
      }
    } catch {}
  }, []);

  // ── Guard: empty cart → back to menu ────────────────────────────────────
  useEffect(() => {
    if (router.isReady && clientId && items.length === 0) {
      router.replace(`/${clientId}`);
    }
  }, [router.isReady, clientId, items.length, router]);

  // ── Cart qty helpers ─────────────────────────────────────────────────────
  function increase(item) {
    updateQty({ id: item.id, variantId: item.variantId, quantity: item.quantity + 1 });
  }
  function decrease(item) {
    updateQty({ id: item.id, variantId: item.variantId, quantity: item.quantity - 1 });
  }

  // ── Place order ──────────────────────────────────────────────────────────
  async function handlePlaceOrder(e) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!address.trim() || address.trim().length < 5) {
      setError('Please enter a complete delivery address (at least 5 characters).');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter your phone number.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          deliveryAddress: address.trim(),
          customerName:    name.trim(),
          customerPhone:   phone.trim(),
          paymentMethod,
          // Map CartContext items to the shape the API route expects
          items: items.map(it => ({
            id:        it.id,
            name:      it.name,
            price:     it.price,
            quantity:  it.quantity,
            variantId: it.variantId || null,
          })),
        }),
      });

      // Success — clear cart and navigate to confirmation
      clearCart();
      router.replace(
        `/${clientId}/order-success?orderId=${encodeURIComponent(result.orderId)}&orderNo=${encodeURIComponent(result.orderNo)}&total=${encodeURIComponent(result.grandTotal)}&payment=${encodeURIComponent(result.paymentMethod)}`
      );
    } catch (err) {
      setError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) return null; // guard fires in useEffect, render nothing meanwhile

  return (
    <>
      <Head>
        <title>Checkout | {clientName || 'Cafe QR Delivery'}</title>
      </Head>

      <div className="min-h-screen bg-stone-50 pb-32">

        {/* Header */}
        <div className="bg-white border-b border-stone-100 px-4 pt-12 pb-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="w-9 h-9 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center"
            >
              <FiArrowLeft size={18} />
            </button>
            <div>
              <h1 className="font-bold text-stone-900 text-base">Checkout</h1>
              <p className="text-xs text-stone-400">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handlePlaceOrder} className="px-4 pt-4 space-y-4">

          {/* Order summary */}
          <SectionCard title="Your Order">
            {items.map(item => (
              <CartLineItem
                key={`${item.id}::${item.variantId ?? ''}`}
                item={item}
                onIncrease={increase}
                onDecrease={decrease}
              />
            ))}
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-stone-100">
              <span className="text-sm font-semibold text-stone-500">Subtotal</span>
              <span className="text-base font-bold text-stone-900">{formatPrice(totalAmount)}</span>
            </div>
          </SectionCard>

          {/* Delivery details */}
          <SectionCard title="Delivery Details">
            <InputField
              icon={FiUser}
              label="Name"
              value={name}
              onChange={setName}
              placeholder="Your full name"
            />
            <InputField
              icon={FiPhone}
              label="Phone"
              value={phone}
              onChange={setPhone}
              placeholder="10-digit mobile number"
              type="tel"
            />
            <InputField
              icon={FiMapPin}
              label="Delivery Address"
              value={address}
              onChange={setAddress}
              placeholder="House/Flat no., Street, Area, Landmark..."
              rows={3}
            />
          </SectionCard>

          {/* Payment method */}
          <SectionCard title="Payment Method">
            <div className="space-y-2">
              <PaymentOption
                id="CASH"
                label="Cash on Delivery"
                description="Pay when your order arrives"
                icon={FiDollarSign}
                selected={paymentMethod === 'CASH'}
                onSelect={setPaymentMethod}
              />
              <PaymentOption
                id="UPI"
                label="UPI"
                description="Pay via UPI when order is delivered"
                icon={FiSmartphone}
                selected={paymentMethod === 'UPI'}
                onSelect={setPaymentMethod}
              />
            </div>
          </SectionCard>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <FiAlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

        </form>
      </div>

      {/* Sticky bottom — place order bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-100 px-4 pt-3 pb-6 z-30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-stone-400">Total payable</span>
          <span className="text-base font-bold text-stone-900">{formatPrice(totalAmount)}</span>
        </div>
        <button
          type="submit"
          form="checkout-form"
          disabled={submitting}
          onClick={handlePlaceOrder}
          className="w-full bg-brand-orange text-white font-bold text-sm py-4 rounded-2xl flex items-center justify-center gap-2 shadow active:scale-[0.98] transition-transform disabled:opacity-60 disabled:scale-100"
        >
          {submitting ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Placing Order…
            </>
          ) : (
            `Place Order · ${formatPrice(totalAmount)}`
          )}
        </button>
      </div>
    </>
  );
}

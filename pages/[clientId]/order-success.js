// pages/[clientId]/order-success.js
// Step 6 — Order Success Page
//
// Reached via router.replace() from checkout.js after a successful POST /api/orders.
// Query params:
//   orderId   — UUID of the created order (used later for order tracking)
//   orderNo   — human-readable order number (e.g. SO-2024-001)
//   total     — grand total as a number string
//   payment   — CASH | UPI
//
// Behaviour:
//   • If any required param is missing, redirect to /[clientId] (home)
//   • Animate a checkmark on mount
//   • Show order summary card
//   • Two CTAs: Back to Menu  |  My Orders (placeholder until Step 7)
//
// Cart is already cleared by checkout.js before navigating here.

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/router';
import Head                    from 'next/head';
import { FiHome, FiList }      from 'react-icons/fi';
import { useCart }             from '@/components/CartContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0,
  }).format(amount);
}

const PAYMENT_LABEL = {
  CASH: 'Cash on Delivery',
  UPI:  'UPI on Delivery',
};

// ── Animated checkmark ────────────────────────────────────────────────────────
// Pure CSS/SVG tick — no external animation library needed.

function AnimatedTick() {
  return (
    <div className="flex items-center justify-center">
      <div
        className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center"
        style={{ animation: 'pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275) both' }}
      >
        <svg
          viewBox="0 0 52 52"
          className="w-12 h-12"
          fill="none"
          stroke="#16a34a"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <style>{`
            @keyframes pop {
              0%   { transform: scale(0.4); opacity: 0; }
              100% { transform: scale(1);   opacity: 1; }
            }
            @keyframes draw-tick {
              0%   { stroke-dashoffset: 60; }
              100% { stroke-dashoffset: 0;  }
            }
          `}</style>
          <polyline
            points="14,27 22,36 38,18"
            strokeDasharray="60"
            strokeDashoffset="60"
            style={{ animation: 'draw-tick 0.45s 0.2s ease forwards' }}
          />
        </svg>
      </div>
    </div>
  );
}

// ── Detail row ────────────────────────────────────────────────────────────────

function DetailRow({ label, value, valueClass = 'text-stone-900' }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-stone-50 last:border-0">
      <span className="text-sm text-stone-500">{label}</span>
      <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrderSuccessPage() {
  const router   = useRouter();
  const { clientName } = useCart();

  const { clientId, orderId, orderNo, total, payment } = router.query;

  // Redirect to home if params are missing (e.g. direct URL visit)
  useEffect(() => {
    if (!router.isReady) return;
    if (!orderId || !orderNo) {
      router.replace(`/${clientId}`);
    }
  }, [router.isReady, orderId, orderNo, clientId, router]);

  // Parse total safely
  const grandTotal = total ? parseFloat(total) : 0;
  const paymentLabel = PAYMENT_LABEL[payment] || payment || 'Cash on Delivery';

  if (!router.isReady || !orderId) return null;

  return (
    <>
      <Head>
        <title>Order Confirmed | {clientName || 'Cafe QR Delivery'}</title>
      </Head>

      <div className="min-h-screen bg-stone-50 flex flex-col">

        {/* ── Top section: tick + heading ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8 text-center">

          <AnimatedTick />

          <h1 className="mt-6 text-2xl font-extrabold text-stone-900 tracking-tight">
            Order Placed!
          </h1>
          <p className="mt-2 text-sm text-stone-500 max-w-xs">
            Your order has been received. We&apos;ll start preparing it right away.
          </p>

          {/* ── Order details card ── */}
          <div className="w-full max-w-sm mt-8 bg-white rounded-2xl border border-stone-100 shadow-sm px-5 py-1">
            <DetailRow label="Order No"     value={orderNo} />
            <DetailRow
              label="Total"
              value={formatPrice(grandTotal)}
              valueClass="text-brand-orange font-bold"
            />
            <DetailRow label="Payment"      value={paymentLabel} />
            <DetailRow label="Status"       value="Confirmed" valueClass="text-green-600" />
          </div>

          {/* ── Delivery note ── */}
          <div className="w-full max-w-sm mt-4 bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3 text-left">
            <p className="text-xs font-bold text-brand-orange uppercase tracking-wide mb-1">
              What happens next?
            </p>
            <ul className="text-sm text-stone-600 space-y-1 list-none">
              <li>🍳 &nbsp;The kitchen is notified immediately</li>
              <li>🛵 &nbsp;A rider will pick up and deliver to you</li>
              {payment === 'CASH' && <li>💵 &nbsp;Please keep cash ready on delivery</li>}
              {payment === 'UPI'  && <li>📱 &nbsp;Please keep UPI app ready on delivery</li>}
            </ul>
          </div>

        </div>

        {/* ── Bottom CTAs ── */}
        <div className="px-6 pb-10 space-y-3">
          {/* My Orders — placeholder until Step 7 */}
          <button
            type="button"
            onClick={() => router.push(`/${clientId}/orders`)}
            className="w-full flex items-center justify-center gap-2 bg-brand-orange text-white font-bold text-sm py-4 rounded-2xl shadow active:scale-[0.98] transition-transform"
          >
            <FiList size={16} />
            My Orders
          </button>

          <button
            type="button"
            onClick={() => router.push(`/${clientId}`)}
            className="w-full flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-700 font-semibold text-sm py-4 rounded-2xl active:bg-stone-50 transition-colors"
          >
            <FiHome size={16} />
            Back to Menu
          </button>
        </div>

      </div>
    </>
  );
}

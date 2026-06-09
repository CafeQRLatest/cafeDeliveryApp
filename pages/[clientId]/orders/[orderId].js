// pages/[clientId]/orders/[orderId].js
// Step 8 — Order Detail & Tracking screen
//
// Shows the full detail of a single order:
//   • Delivery progress stepper (4 steps)
//   • Items ordered with qty × price per line
//   • Price breakdown
//   • Delivery address card
//   • Payment method + status
//   • Customer name / phone
//
// Data from GET /api/orders/<orderId>?clientId=<uuid>
// which proxies to the Java backend GET /api/v1/orders/{id}.

import { useState, useEffect } from 'react';
import { useRouter }           from 'next/router';
import Head                    from 'next/head';
import {
  FiArrowLeft, FiMapPin, FiUser, FiPhone,
  FiDollarSign, FiSmartphone, FiAlertCircle,
} from 'react-icons/fi';
import { apiFetch } from '@/lib/api';
import { useCart }  from '@/components/CartContext';

// ── Delivery progress stepper config ─────────────────────────────────────────────────
//
// Backend orderStatus values → step index mapping:
//   CONFIRMED                    → step 0  (Order placed, kitchen notified)
//   PROCESSING / IN_PROGRESS     → step 1  (Being prepared)
//   BILLED / DISPATCHED          → step 2  (Out for delivery)
//   COMPLETED / PAID             → step 3  (Delivered)
//   CANCELLED / VOID             → -1      (show cancelled banner instead)

const STEPS = [
  { key: 'placed',   emoji: '\uD83D\uDCDD', label: 'Order Placed',    sub: 'Kitchen notified'       },
  { key: 'prep',     emoji: '\uD83C\uDF73', label: 'Preparing',       sub: 'Your food is being made' },
  { key: 'dispatch', emoji: '\uD83D\uDEF5', label: 'Out for Delivery', sub: 'Rider is on the way'    },
  { key: 'done',     emoji: '\u2705',       label: 'Delivered',        sub: 'Enjoy your meal!'       },
];

function statusToStep(orderStatus) {
  const s = (orderStatus || '').toUpperCase();
  if (['CANCELLED', 'VOID'].includes(s))       return -1;
  if (['COMPLETED', 'PAID', 'SETTLED'].includes(s)) return 3;
  if (['BILLED', 'DISPATCHED'].includes(s))    return 2;
  if (['PROCESSING', 'IN_PROGRESS', 'DRAFT'].includes(s)) return 1;
  return 0; // CONFIRMED, PENDING, or anything else → step 0
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function formatPrice(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch { return iso; }
}

function extractAddress(description) {
  if (!description) return '';
  const match = description.match(/^DELIVERY TO:\s*/i);
  return match ? description.slice(match[0].length).trim() : description.trim();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
      {title && (
        <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

// 4-step visual stepper
function DeliveryTracker({ step }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-4 py-5">
      <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-5">
        Delivery Progress
      </p>
      <div className="relative">
        {/* Connector line */}
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-stone-100" />
        <div
          className="absolute top-5 left-5 h-0.5 bg-brand-orange transition-all duration-500"
          style={{ width: step <= 0 ? '0%' : `${(step / (STEPS.length - 1)) * 100}%` }}
        />

        <div className="relative flex justify-between">
          {STEPS.map((s, idx) => {
            const done    = step >= idx;
            const current = step === idx;
            return (
              <div key={s.key} className="flex flex-col items-center w-16">
                {/* Circle */}
                <div className={[
                  'w-10 h-10 rounded-full flex items-center justify-center text-lg z-10 transition-colors duration-300',
                  done
                    ? 'bg-brand-orange text-white shadow-md'
                    : 'bg-stone-100 text-stone-300',
                  current ? 'ring-4 ring-orange-100' : '',
                ].join(' ')}>
                  {s.emoji}
                </div>
                {/* Label */}
                <p className={`text-xs font-semibold mt-2 text-center leading-tight ${
                  done ? 'text-stone-800' : 'text-stone-300'
                }`}>
                  {s.label}
                </p>
                {current && (
                  <p className="text-[10px] text-brand-orange text-center mt-0.5 leading-tight">
                    {s.sub}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CancelledBanner() {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
      <FiAlertCircle size={20} className="text-red-500 flex-shrink-0" />
      <div>
        <p className="text-sm font-bold text-red-700">Order Cancelled</p>
        <p className="text-xs text-red-500 mt-0.5">This order was cancelled and will not be delivered.</p>
      </div>
    </div>
  );
}

function PriceRow({ label, value, bold = false, highlight = false }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className={`text-sm ${bold ? 'font-bold text-stone-900' : 'text-stone-500'}`}>
        {label}
      </span>
      <span className={`text-sm font-semibold ${
        highlight ? 'text-brand-orange text-base font-bold' : bold ? 'text-stone-900' : 'text-stone-700'
      }`}>
        {value}
      </span>
    </div>
  );
}

// Skeleton loader
function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="bg-white rounded-2xl p-5 space-y-3">
        <div className="h-3 bg-stone-100 rounded w-1/3" />
        <div className="flex justify-between mt-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-stone-100" />
              <div className="h-2.5 bg-stone-100 rounded w-12" />
            </div>
          ))}
        </div>
      </div>
      {[1,2,3].map(i => (
        <div key={i} className="bg-white rounded-2xl p-4 space-y-2">
          <div className="h-3 bg-stone-100 rounded w-1/4" />
          <div className="h-3 bg-stone-100 rounded w-3/4" />
          <div className="h-3 bg-stone-100 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const router  = useRouter();
  const { clientId, orderId } = router.query;
  const { clientName } = useCart();

  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!router.isReady || !orderId || !clientId) return;
    setLoading(true);
    setError(null);
    apiFetch(`/orders/${orderId}`, { params: { clientId } })
      .then(data => setOrder(data))
      .catch(err => setError(err.message || 'Failed to load order'))
      .finally(() => setLoading(false));
  }, [router.isReady, orderId, clientId]);

  const step       = order ? statusToStep(order.orderStatus) : 0;
  const isCancelled = step === -1;
  const address    = order ? extractAddress(order.description) : '';
  const paymentIcon = order?.paymentMethod === 'UPI' ? FiSmartphone : FiDollarSign;
  const paymentLabel = order?.paymentMethod === 'UPI' ? 'UPI on Delivery' : 'Cash on Delivery';

  return (
    <>
      <Head>
        <title>Order Detail | {clientName || 'Cafe QR Delivery'}</title>
      </Head>

      <div className="min-h-screen bg-stone-50 pb-10">

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
              <h1 className="font-bold text-stone-900 text-base">
                {order?.orderNo ? `Order ${order.orderNo}` : 'Order Detail'}
              </h1>
              {order?.orderDate && (
                <p className="text-xs text-stone-400">{formatDate(order.orderDate)}</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 space-y-4">

          {loading && <Skeleton />}

          {!loading && error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-2xl p-4">
              <FiAlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {!loading && order && (
            <>
              {/* Cancelled banner OR delivery tracker */}
              {isCancelled
                ? <CancelledBanner />
                : <DeliveryTracker step={step} />
              }

              {/* Items */}
              <SectionCard title="Items Ordered">
                {order.lines.length === 0 && (
                  <p className="text-sm text-stone-400">No items found.</p>
                )}
                {order.lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2.5 border-b border-stone-50 last:border-0"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-sm font-medium text-stone-900 truncate">
                        {line.productName}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {formatPrice(line.unitPrice)} × {line.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-stone-900 flex-shrink-0">
                      {formatPrice(line.lineTotal)}
                    </p>
                  </div>
                ))}
              </SectionCard>

              {/* Price breakdown */}
              <SectionCard title="Price Breakdown">
                <PriceRow label="Subtotal"    value={formatPrice(order.totalAmount)} />
                {order.totalDiscountAmount > 0 && (
                  <PriceRow label="Discount" value={`− ${formatPrice(order.totalDiscountAmount)}`} />
                )}
                {order.totalTaxAmount > 0 && (
                  <PriceRow label="Tax" value={formatPrice(order.totalTaxAmount)} />
                )}
                <div className="border-t border-stone-100 mt-1 pt-1">
                  <PriceRow
                    label="Total Payable"
                    value={formatPrice(order.grandTotal)}
                    bold highlight
                  />
                </div>
              </SectionCard>

              {/* Delivery address */}
              {address && (
                <SectionCard title="Delivery Address">
                  <div className="flex items-start gap-2">
                    <FiMapPin size={15} className="text-brand-orange mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-stone-700 leading-relaxed">{address}</p>
                  </div>
                </SectionCard>
              )}

              {/* Payment */}
              <SectionCard title="Payment">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                    {paymentIcon === FiSmartphone
                      ? <FiSmartphone size={16} className="text-brand-orange" />
                      : <FiDollarSign  size={16} className="text-brand-orange" />
                    }
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-stone-900">{paymentLabel}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Status:{' '}
                      <span className={`font-semibold ${
                        order.paymentStatus === 'PAID' ? 'text-green-600' : 'text-amber-500'
                      }`}>
                        {order.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}
                      </span>
                    </p>
                  </div>
                </div>
              </SectionCard>

              {/* Customer */}
              {order.customer && (
                <SectionCard title="Delivered To">
                  <div className="space-y-2">
                    {order.customer.name && (
                      <div className="flex items-center gap-2">
                        <FiUser size={14} className="text-stone-400 flex-shrink-0" />
                        <p className="text-sm text-stone-700">{order.customer.name}</p>
                      </div>
                    )}
                    {order.customer.phone && (
                      <div className="flex items-center gap-2">
                        <FiPhone size={14} className="text-stone-400 flex-shrink-0" />
                        <p className="text-sm text-stone-700">{order.customer.phone}</p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

            </>
          )}
        </div>
      </div>
    </>
  );
}

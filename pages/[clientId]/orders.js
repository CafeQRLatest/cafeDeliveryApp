// pages/[clientId]/orders.js
// Step 7 — My Orders list page
//
// Shows the logged-in customer's past delivery orders for this store,
// newest first. Data comes from GET /api/orders/list?clientId=&page=&size=
// which proxies to the backend /v1/orders/history?q={phone} endpoint.
//
// Features:
//   • Status badge colour-coded by orderStatus
//   • Delivery address extracted from order.description
//   • Load More pagination (page-based — matches Spring Page)
//   • Refresh button
//   • Empty state with CTA to menu
//   • Tapping an order → /[clientId]/orders/[orderId]  (Step 8 — detail/tracking)

import { useState, useEffect, useCallback } from 'react';
import { useRouter }                         from 'next/router';
import Head                                  from 'next/head';
import {
  FiArrowLeft, FiRefreshCw, FiShoppingBag, FiChevronRight,
} from 'react-icons/fi';
import { apiFetch }  from '@/lib/api';
import { useCart }   from '@/components/CartContext';

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// orderStatus → { label, bg, text }
const STATUS_STYLE = {
  CONFIRMED:  { label: 'Confirmed',  bg: 'bg-blue-50',   text: 'text-blue-600'  },
  PROCESSING: { label: 'Processing', bg: 'bg-yellow-50',  text: 'text-yellow-600'},
  COMPLETED:  { label: 'Delivered',  bg: 'bg-green-50',  text: 'text-green-600' },
  PAID:       { label: 'Paid',       bg: 'bg-green-50',  text: 'text-green-600' },
  CANCELLED:  { label: 'Cancelled',  bg: 'bg-red-50',    text: 'text-red-500'   },
  VOID:       { label: 'Cancelled',  bg: 'bg-red-50',    text: 'text-red-500'   },
  PENDING:    { label: 'Pending',    bg: 'bg-stone-100', text: 'text-stone-500' },
};

const PAYMENT_LABEL = { CASH: 'Cash on Delivery', UPI: 'UPI on Delivery' };

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// Extract the delivery address from the "DELIVERY TO: <address>" description
function extractAddress(description) {
  if (!description) return '';
  const match = description.match(/^DELIVERY TO:\s*/i);
  return match ? description.slice(match[0].length).trim() : description.trim();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.PENDING;
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function OrderCard({ order, onClick }) {
  const address = extractAddress(order.description);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex items-start gap-3 active:bg-stone-50 transition-colors"
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <FiShoppingBag size={18} className="text-brand-orange" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-bold text-stone-900 truncate">
            {order.orderNo || `Order #${order.orderId.slice(-6).toUpperCase()}`}
          </span>
          <StatusBadge status={order.orderStatus} />
        </div>

        {address ? (
          <p className="text-xs text-stone-400 truncate mb-1.5">{address}</p>
        ) : null}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-stone-900">{formatPrice(order.grandTotal)}</p>
            <p className="text-xs text-stone-400 mt-0.5">
              {PAYMENT_LABEL[order.paymentMethod] || order.paymentMethod}
              {order.itemCount > 0 ? ` · ${order.itemCount} item${order.itemCount !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 text-stone-400">
            <span className="text-xs">{formatDate(order.createdAt)}</span>
            <FiChevronRight size={14} />
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyState({ clientId }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 text-center py-20">
      <div className="w-20 h-20 rounded-full bg-orange-50 flex items-center justify-center mb-4">
        <FiShoppingBag size={32} className="text-brand-orange" />
      </div>
      <h2 className="text-lg font-bold text-stone-800 mb-2">No orders yet</h2>
      <p className="text-sm text-stone-400 mb-6">
        Your delivery orders will appear here once you place one.
      </p>
      <button
        type="button"
        onClick={() => router.push(`/${clientId}`)}
        className="bg-brand-orange text-white font-bold text-sm px-6 py-3 rounded-2xl shadow active:scale-[0.98] transition-transform"
      >
        Browse Menu
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const router  = useRouter();
  const { clientId } = router.query;
  const { clientName } = useCart();

  const [orders,      setOrders]      = useState([]);
  const [pagination,  setPagination]  = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(null);

  // ── Fetch helpers ────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (page = 0, replace = true) => {
    if (!clientId) return;
    page === 0 ? setLoading(true) : setLoadingMore(true);
    setError(null);
    try {
      const data = await apiFetch('/orders/list', {
        params: { clientId, page, size: PAGE_SIZE },
      });
      setOrders(prev => replace ? data.orders : [...prev, ...data.orders]);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [clientId]);

  // Initial load
  useEffect(() => {
    if (router.isReady && clientId) {
      fetchPage(0, true);
    }
  }, [router.isReady, clientId, fetchPage]);

  function handleLoadMore() {
    if (!pagination?.hasMore || loadingMore) return;
    fetchPage(pagination.page + 1, false);
  }

  function handleRefresh() {
    fetchPage(0, true);
  }

  function handleOrderTap(orderId) {
    router.push(`/${clientId}/orders/${orderId}`);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>My Orders | {clientName || 'Cafe QR Delivery'}</title>
      </Head>

      <div className="min-h-screen bg-stone-50 flex flex-col">

        {/* Header */}
        <div className="bg-white border-b border-stone-100 px-4 pt-12 pb-4 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="w-9 h-9 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center"
              >
                <FiArrowLeft size={18} />
              </button>
              <div>
                <h1 className="font-bold text-stone-900 text-base">My Orders</h1>
                {pagination && (
                  <p className="text-xs text-stone-400">
                    {pagination.totalElements} order{pagination.totalElements !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Refresh button */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="w-9 h-9 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center disabled:opacity-40"
            >
              <FiRefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col">

          {/* Loading skeleton */}
          {loading && (
            <div className="px-4 pt-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-stone-100 p-4 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-xl bg-stone-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-stone-100 rounded w-1/2" />
                      <div className="h-3 bg-stone-100 rounded w-3/4" />
                      <div className="h-3 bg-stone-100 rounded w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && orders.length === 0 && (
            <EmptyState clientId={clientId} />
          )}

          {/* Orders list */}
          {!loading && orders.length > 0 && (
            <div className="px-4 pt-4 pb-8 space-y-3">
              {orders.map(order => (
                <OrderCard
                  key={order.orderId}
                  order={order}
                  onClick={() => handleOrderTap(order.orderId)}
                />
              ))}

              {/* Load More */}
              {pagination?.hasMore && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full py-3.5 rounded-2xl border border-stone-200 text-sm font-semibold text-stone-600 bg-white active:bg-stone-50 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? 'Loading…' : 'Load More'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

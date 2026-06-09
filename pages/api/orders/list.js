// pages/api/orders/list.js
// GET /api/orders/list?clientId=<uuid>&page=0&size=10&status=
//
// Server-side proxy: fetches the current session user's order history from the
// Java backend, scoped to the given store (clientId / tenant).
//
// ── Auth ──────────────────────────────────────────────────────────────────────
// Requires a valid delivery_session cookie.
// The session carries { email, name, phone } — we use phone as the search key
// because the backend's /history?q= endpoint matches by customer name OR phone.
//
// ── Backend endpoint ──────────────────────────────────────────────────────────
// GET /api/v1/orders/history
//   ?q        = session.phone   (filters by customer phone)
//   ?fromDate =                 (omitted — return all history)
//   ?status   = optional        (CONFIRMED | COMPLETED | CANCELLED)
//   ?page     = 0-based page    (default 0)
//   ?size     = page size       (default 10, max 20 per backend cap of 50)
// X-Client-ID header → TenantInterceptor sets tenant context
//
// ── Response shape ────────────────────────────────────────────────────────────
// Returns a slim array of order cards — only what the list UI needs:
// [
//   {
//     orderId, orderNo, orderStatus, paymentStatus,
//     grandTotal, paymentMethod, createdAt,
//     itemCount, description
//   }
// ]
// Plus pagination meta: { page, size, totalElements, totalPages, hasMore }

import { getSessionFromReq } from '@/lib/auth';
import { backendFetch }      from '@/lib/api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth guard ────────────────────────────────────────────────────────────
  const session = getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { clientId, page = '0', size = '10', status } = req.query;

  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'clientId is required' });
  }

  // Clamp page size — backend hard-caps at 50; we show max 20 per page
  const safePage = Math.max(0, parseInt(page, 10) || 0);
  const safeSize = Math.min(20, Math.max(1, parseInt(size, 10) || 10));

  // ── Build query params ────────────────────────────────────────────────────
  const params = {
    q:    session.phone || session.email, // phone is primary; fall back to email
    page: safePage,
    size: safeSize,
  };
  // Only forward status if explicitly provided (avoids empty-string param)
  if (status && typeof status === 'string' && status.trim()) {
    params.status = status.trim().toUpperCase();
  }

  try {
    const raw = await backendFetch(
      '/v1/orders/history',
      {
        method:  'GET',
        params,
        headers: { 'X-Client-ID': clientId },
      },
      req,
    );

    // Backend wraps in ApiResponse<Page<OrderSummaryDto>> → unwrap .data
    const pageData = raw?.data ?? raw;

    // pageData is a Spring Page object:
    // { content: [...], totalElements, totalPages, number, size, ... }
    const content = Array.isArray(pageData?.content) ? pageData.content : [];

    // Map to slim card shape — only pick fields the UI actually needs
    const orders = content.map(o => ({
      orderId:       String(o.id ?? o.orderId ?? ''),
      orderNo:       o.orderNo   ?? '',
      orderStatus:   o.orderStatus  ?? 'CONFIRMED',
      paymentStatus: o.paymentStatus ?? 'PENDING',
      grandTotal:    Number(o.grandTotal ?? 0),
      paymentMethod: o.paymentMethod ?? 'CASH',
      createdAt:     o.createdAt ?? o.orderDate ?? null,
      // itemCount: use lines array length if available, else orderLineCount
      itemCount:     Array.isArray(o.lines)
        ? o.lines.length
        : (o.orderLineCount ?? o.itemCount ?? 0),
      // description carries "DELIVERY TO: <address>" — shown as delivery address
      description:   o.description ?? '',
    }));

    return res.status(200).json({
      orders,
      pagination: {
        page:          pageData?.number  ?? safePage,
        size:          pageData?.size    ?? safeSize,
        totalElements: pageData?.totalElements ?? orders.length,
        totalPages:    pageData?.totalPages    ?? 1,
        hasMore:       !(pageData?.last ?? true),
      },
    });
  } catch (err) {
    console.error('[api/orders/list] fetch failed', clientId, err.message);
    const status = err.status || 500;
    return res.status(status).json({
      error:   err.message || 'Failed to fetch orders',
      details: err.payload || null,
    });
  }
}

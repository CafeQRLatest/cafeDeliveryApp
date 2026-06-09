// pages/api/orders/[orderId].js
// GET /api/orders/<orderId>?clientId=<uuid>
//
// Server-side proxy: fetches a single order's full detail from the Java backend.
//
// ── Auth + IDOR guard ────────────────────────────────────────────────────────────
// 1. Requires a valid delivery_session cookie.
// 2. After fetching the order from the backend, verifies that the session
//    user's phone matches the primary customer's phone on the order.
//    Returns 403 if it doesn't match — prevents IDOR (one customer viewing
//    another customer's order by guessing a UUID).
//
// ── Backend endpoint ──────────────────────────────────────────────────────────
// GET /api/v1/orders/{id}
// X-Client-ID header → TenantInterceptor sets tenant context
//
// The backend returns OrderResponseDto which includes:
//   id, orderNo, orderStatus, paymentStatus, fulfillmentType,
//   description ("DELIVERY TO: <address>"),
//   grandTotal, totalAmount, totalTaxAmount, totalDiscountAmount,
//   paymentMethod, orderDate,
//   customers: [{ id, name, phone, primary }],
//   lines: [{ productName, quantity, unitPrice, lineTotal, ... }]

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

  const { orderId, clientId } = req.query;

  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ error: 'orderId is required' });
  }
  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'clientId is required' });
  }

  try {
    const raw = await backendFetch(
      `/v1/orders/${encodeURIComponent(orderId)}`,
      {
        method:  'GET',
        headers: { 'X-Client-ID': clientId },
      },
      req,
    );

    // Backend wraps in ApiResponse<OrderResponseDto> → unwrap .data
    const order = raw?.data ?? raw;

    // ── IDOR guard ─────────────────────────────────────────────────────────
    // Verify the session user is the primary customer on this order.
    // customers is List<OrderCustomerDto>: [{ id, name, phone, primary }]
    const customers = Array.isArray(order.customers) ? order.customers : [];
    const primaryCustomer = customers.find(c => c.primary) || customers[0] || null;

    // Only enforce if the order has customer data (orders created before
    // customerPhone was added won't have it — be lenient for legacy orders)
    if (
      primaryCustomer?.phone &&
      session.phone &&
      primaryCustomer.phone.replace(/\D/g, '') !== session.phone.replace(/\D/g, '')
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // ── Build response shape ──────────────────────────────────────────────────────
    // Only forward what the detail page needs — omit ERP-internal fields.
    return res.status(200).json({
      orderId:              String(order.id ?? ''),
      orderNo:              order.orderNo              ?? '',
      orderStatus:          order.orderStatus          ?? 'CONFIRMED',
      paymentStatus:        order.paymentStatus        ?? 'PENDING',
      paymentMethod:        order.paymentMethod        ?? 'CASH',
      fulfillmentType:      order.fulfillmentType      ?? 'DELIVERY',
      description:          order.description          ?? '',
      orderDate:            order.orderDate            ?? null,
      grandTotal:           Number(order.grandTotal    ?? 0),
      totalAmount:          Number(order.totalAmount   ?? 0),
      totalTaxAmount:       Number(order.totalTaxAmount    ?? 0),
      totalDiscountAmount:  Number(order.totalDiscountAmount ?? 0),
      customer: primaryCustomer
        ? { name: primaryCustomer.name, phone: primaryCustomer.phone }
        : null,
      lines: Array.isArray(order.lines)
        ? order.lines.map(l => ({
            productName: l.productName ?? '',
            quantity:    Number(l.quantity  ?? 0),
            unitPrice:   Number(l.unitPrice ?? 0),
            lineTotal:   Number(l.lineTotal ?? 0),
          }))
        : [],
    });
  } catch (err) {
    console.error('[api/orders/detail] fetch failed', orderId, err.message);
    const status = err.status || 500;
    return res.status(status).json({
      error:   err.message || 'Failed to fetch order',
      details: err.payload || null,
    });
  }
}

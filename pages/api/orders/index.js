// pages/api/orders/index.js
// POST /api/orders
//
// Server-side proxy: creates a delivery order in the Java backend.
//
// ── Auth ─────────────────────────────────────────────────────────────────────
// Requires a valid delivery_session cookie (verified by getSessionFromReq).
// The session carries { email, name, phone } — no userId or backend JWT.
//
// ── Tenant scoping ───────────────────────────────────────────────────────────
// clientId is passed in the request body and forwarded as X-Client-ID header
// so TenantInterceptor.java sets the correct tenant context (same pattern as
// the menu proxy).
//
// ── Backend field mapping ─────────────────────────────────────────────────────
// Maps to CreateOrderRequest (com.restaurant.pos.order.dto.CreateOrderRequest).
// Key constraints discovered from source reading:
//   • orderType       REQUIRED (NotNull) — always "SALE" for delivery
//   • lines           REQUIRED (NotEmpty) — at least one line
//   • lines[].productId   REQUIRED (NotNull UUID)
//   • lines[].quantity    REQUIRED (NotNull, DecimalMin 0.01)
//   • lines[].unitPrice   REQUIRED (NotNull, DecimalMin 0.00)
//   • orderSource     NOT a field on CreateOrderRequest — backend sets it to
//                     "OFFLINE" via @Builder.Default on Order.java entity.
//                     We cannot override this through the API currently.
//   • paymentStatus   "PENDING" — delivery app never settles at order time;
//                     the store settles when the rider delivers.
//
// ── Customer resolution ───────────────────────────────────────────────────────
// customerName + customerPhone are sent as top-level fields on the request.
// OrderService.createOrder() calls prepareCustomerFields() → resolveCustomer()
// which:
//   1. Looks up an existing Customer record by phone in the tenant.
//   2. Creates a new Customer (category: REGULAR) if none found.
//   3. Links the customer to the order via Customer.orderLinks.
//   4. Writes customerId / customerName / customerPhone back onto the order.
// This means repeat customers are de-duplicated automatically, and their name
// appears on KOT / bill / POS order history.
//
// description carries ONLY the delivery address (no dedicated field exists in
// CreateOrderRequest for a street address).
//
// ── Request body (from checkout page) ────────────────────────────────────────
//   clientId:         string   (UUID of the store)
//   deliveryAddress:  string   (user's full address — stored in order.description)
//   customerName:     string   (user's name — forwarded to Customer table)
//   customerPhone:    string   (user's phone — forwarded to Customer table)
//   paymentMethod:    string   "CASH" | "UPI"  (default: "CASH")
//   items: [
//     { id, name, price, quantity, variantId? }
//   ]
//
// ── Response ─────────────────────────────────────────────────────────────────
//   { orderId, orderNo, orderStatus, paymentStatus, grandTotal, paymentMethod }

import { getSessionFromReq } from '@/lib/auth';
import { backendFetch }      from '@/lib/api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth guard ────────────────────────────────────────────────────────────
  const session = getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  const {
    clientId,
    deliveryAddress,
    customerName,
    customerPhone,
    paymentMethod: rawPaymentMethod,
    items,
  } = req.body || {};

  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'clientId is required' });
  }
  if (!deliveryAddress || typeof deliveryAddress !== 'string' || deliveryAddress.trim().length < 5) {
    return res.status(400).json({ error: 'A valid delivery address is required (min 5 chars)' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }

  // Validate each line — surface the first bad item to aid debugging
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.id || typeof it.id !== 'string') {
      return res.status(400).json({ error: `Item[${i}].id is required` });
    }
    if (typeof it.price !== 'number' || it.price < 0) {
      return res.status(400).json({ error: `Item[${i}].price must be a non-negative number` });
    }
    if (typeof it.quantity !== 'number' || it.quantity < 1) {
      return res.status(400).json({ error: `Item[${i}].quantity must be >= 1` });
    }
  }

  // Normalise paymentMethod — only CASH and UPI are supported for delivery MVP
  const paymentMethod = (rawPaymentMethod === 'UPI') ? 'UPI' : 'CASH';

  // Resolve name and phone — prefer explicit body values, fall back to session
  const resolvedName  = (customerName  && customerName.trim())  || session.name  || '';
  const resolvedPhone = (customerPhone && customerPhone.trim()) || session.phone || '';

  // ── Build totals ──────────────────────────────────────────────────────────
  // No tax logic in delivery MVP — taxRate=0, taxAmount=0 on every line.
  // grossLineAmount = lineTotal = qty × unitPrice (face value before discounts).
  const lines = items.map(it => {
    const qty       = Number(it.quantity);
    const unitPrice = Number(it.price);
    const lineTotal = parseFloat((qty * unitPrice).toFixed(2));
    return {
      productId:       it.id,
      variantId:       it.variantId || null,
      productName:     it.name     || '',
      quantity:        qty,
      unitPrice:       unitPrice,
      lineTotal:       lineTotal,
      grossLineAmount: lineTotal,   // face total (pre-discount) = same as lineTotal here
      taxRate:         0,
      taxAmount:       0,
      discountAmount:  0,
      taxType:         'NONE',
    };
  });

  const grandTotal = parseFloat(
    lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2)
  );

  // ── Build CreateOrderRequest payload ─────────────────────────────────────
  // Field names match exactly what OrderDtoMapper.toEntity() reads.
  //
  // customerName + customerPhone feed OrderService.resolveCustomer() which
  // upserts a Customer record by phone and links it to this order.
  // description carries ONLY the delivery address.
  const payload = {
    orderType:            'SALE',
    fulfillmentType:      'DELIVERY',
    orderStatus:          'CONFIRMED',
    paymentStatus:        'PENDING',      // settled by store on delivery
    paymentMethod:        paymentMethod,
    customerName:         resolvedName,
    customerPhone:        resolvedPhone,
    description:          `DELIVERY TO: ${deliveryAddress.trim()}`,
    totalAmount:          grandTotal,
    totalTaxAmount:       0,
    totalDiscountAmount:  0,
    grandTotal:           grandTotal,
    grossAmount:          grandTotal,     // = sum of grossLineAmount, no order-level discount
    lines,
  };

  // ── Proxy to backend ──────────────────────────────────────────────────────
  try {
    const raw = await backendFetch(
      '/v1/orders',
      {
        method: 'POST',
        data:   payload,
        headers: { 'X-Client-ID': clientId },
      },
      req,
    );

    // Backend wraps in ApiResponse<T> — unwrap .data
    const order = raw?.data ?? raw;

    // Return only what the checkout page needs
    return res.status(200).json({
      orderId:       String(order.id),
      orderNo:       order.orderNo   || '',
      orderStatus:   order.orderStatus  || 'CONFIRMED',
      paymentStatus: order.paymentStatus || 'PENDING',
      grandTotal:    Number(order.grandTotal ?? grandTotal),
      paymentMethod: order.paymentMethod || paymentMethod,
    });
  } catch (err) {
    console.error('[api/orders] create failed', clientId, err.message, err.payload);
    const status = err.status || 500;
    return res.status(status).json({
      error:   err.message || 'Failed to place order',
      details: err.payload || null,
    });
  }
}

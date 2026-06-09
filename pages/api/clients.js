// pages/api/clients.js
// ─── GET /api/clients ──────────────────────────────────────────────────
//
// Server-side proxy: fetches clients with delivery enabled from the
// Cafe QR Java backend and returns a sanitised list to the app.
//
// Flow:
//   Browser/App  →  GET /api/clients
//              →  backendFetch GET /v1/clients?deliveryEnabled=true
//              ←  sanitised JSON array
//
// Auth: requires a valid delivery_session cookie.
// Returns 401 if the session is missing or invalid.
//
// Response shape (array of):
//   {
//     id:                  string  (UUID — used as [clientId] route param)
//     name:                string
//     description:         string | null
//     logoUrl:             string | null
//     category:            string | null  (e.g. "Cafe", "Bakery", "Retail")
//     minOrderAmount:      number | null
//     deliveryTimeMinutes: number | null
//     isOpen:              boolean
//   }

import { getSessionFromReq } from '@/lib/auth';
import { backendFetch }      from '@/lib/api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ─ Auth guard ───────────────────────────────────────────────────
  const session = getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  try {
    // ─ Proxy to Java backend ───────────────────────────────────────
    // The backend exposes clients (tenants) via /v1/clients.
    // We request only those with online delivery enabled.
    const raw = await backendFetch(
      '/v1/clients',
      {
        method: 'GET',
        params: {
          deliveryEnabled: true,
          isactive: 'Y',
        },
      },
      req,
    );

    // Backend may return { content: [...] } (Page) or a plain array.
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.content)
        ? raw.content
        : [];

    // ─ Sanitise — only expose fields the app needs ─────────────────────
    const clients = list.map(c => ({
      id:                  c.id          || c.clientId || null,
      name:                c.name        || c.clientName || '',
      description:         c.description || null,
      logoUrl:             c.logoUrl     || c.logo || null,
      category:            c.category    || c.businessType || null,
      minOrderAmount:      c.minOrderAmount      != null ? Number(c.minOrderAmount)      : null,
      deliveryTimeMinutes: c.deliveryTimeMinutes != null ? Number(c.deliveryTimeMinutes) : null,
      isOpen:              c.isOpen != null ? Boolean(c.isOpen) : true,
    })).filter(c => c.id); // drop any entries without an id

    return res.status(200).json(clients);
  } catch (err) {
    console.error('[api/clients]', err.message);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to load clients' });
  }
}

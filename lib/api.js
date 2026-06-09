// lib/api.js
// ─── Backend API Proxy Utility ───────────────────────────────────────────────
//
// All backend calls in this app are routed THROUGH Next.js API routes
// (pages/api/**) rather than calling the Java backend directly from
// the browser/app.  This is required for two reasons:
//
//   1. CORS — the Android APK (Capacitor) has origin `capacitor://localhost`
//      which the Spring backend does not whitelist.
//   2. Secrets — the backend may require an INTERNAL_API_SECRET header that
//      must never be exposed to the client bundle.
//
// USAGE (from a page or component):
//   import { apiFetch } from '@/lib/api';
//   const data = await apiFetch('/restaurants');           // GET
//   const order = await apiFetch('/orders', {             // POST
//     method: 'POST',
//     body: JSON.stringify(payload),
//   });
//
// USAGE (from a Next.js API route — server-side proxy to Java backend):
//   import { backendFetch } from '@/lib/api';
//   const data = await backendFetch('/api/v1/clients', req);

import axios from 'axios';

// ─── Client-side helper (browser / Capacitor) ────────────────────────────────
// Calls a Next.js API route at /api/<path>.
// Automatically includes credentials (cookies) so the session cookie travels.

export async function apiFetch(path, options = {}) {
  const url = `/api${path.startsWith('/') ? path : '/' + path}`;
  const method = (options.method || 'GET').toUpperCase();

  const config = {
    url,
    method,
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  if (options.body) {
    config.data = typeof options.body === 'string'
      ? JSON.parse(options.body)
      : options.body;
  }

  if (options.params) {
    config.params = options.params;
  }

  try {
    const res = await axios(config);
    return res.data;
  } catch (err) {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      'Something went wrong';
    throw new Error(msg);
  }
}

// ─── Server-side helper (inside pages/api/** routes) ─────────────────────────
// Calls the Java backend directly using NEXT_PUBLIC_API_BASE_URL.
// Optionally forwards the user session cookie so the backend can
// authenticate the delivery user (when the backend supports it).
//
// @param {string} path          - e.g. '/v1/clients?delivery=true'
// @param {object} [options]     - axios request config overrides
// @param {object} [incomingReq] - Next.js req object (to forward cookies)

export async function backendFetch(path, options = {}, incomingReq = null) {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080/api')
    .replace(/\/$/, '');

  const url = `${base}${path.startsWith('/') ? path : '/' + path}`;

  const headers = {
    'Content-Type': 'application/json',
    // Forward the internal secret so the backend can trust this server-side call
    ...(process.env.INTERNAL_API_SECRET
      ? { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET }
      : {}),
    ...(options.headers || {}),
  };

  // Forward user session cookie to backend if available
  if (incomingReq?.headers?.cookie) {
    headers['Cookie'] = incomingReq.headers.cookie;
  }

  const config = {
    url,
    method: options.method || 'GET',
    headers,
    timeout: 15000, // 15 s — generous for cold Render.com starts
    ...(options.data ? { data: options.data } : {}),
    ...(options.params ? { params: options.params } : {}),
  };

  // One automatic retry on network error or 503 (cold start)
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await axios(config);
      return res.data;
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      // Only retry on network errors or 503 Service Unavailable (cold start)
      if (status && status !== 503) break;
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1200)); // wait 1.2 s before retry
      }
    }
  }

  // Normalise error for the calling API route
  const status  = lastErr?.response?.status || 500;
  const message =
    lastErr?.response?.data?.message ||
    lastErr?.response?.data?.error ||
    lastErr?.message ||
    'Backend request failed';

  const error = new Error(message);
  error.status  = status;
  error.payload = lastErr?.response?.data || null;
  throw error;
}

// ─── Convenience: returns the backend base URL (useful for debug logging) ────
export function getBackendUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080/api')
    .replace(/\/$/, '');
}

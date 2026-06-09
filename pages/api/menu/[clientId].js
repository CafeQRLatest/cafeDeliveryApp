// pages/api/menu/[clientId].js
// GET /api/menu/:clientId
//
// Server-side proxy: fetches the product list for a specific client
// (store / tenant) from the Java backend and returns grouped menu sections.
//
// Key insight (from TenantInterceptor.java):
//   The backend resolves the active tenant from the X-Client-ID request header.
//   We pass the clientId from the URL param as that header value.
//   Auth role is resolved from the JWT -- we forward the session cookie.
//
// Flow:
//   App  ->  GET /api/menu/:clientId
//        ->  backendFetch GET /v1/products  { headers: { X-Client-ID: clientId } }
//        <-  grouped menu sections
//
// Response shape:
//   {
//     clientId: string,
//     sections: [
//       {
//         category: string,
//         categoryId: string | null,
//         items: [
//           {
//             id:           string
//             name:         string
//             description:  string | null
//             price:        number
//             imageUrl:     string | null
//             categoryId:   string | null
//             categoryName: string
//             hasVariants:  boolean
//             variantCount: number
//             taxRate:      number | null
//             productCode:  string | null
//           }
//         ]
//       }
//     ]
//   }

import { getSessionFromReq } from '@/lib/auth';
import { backendFetch }      from '@/lib/api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth guard
  const session = getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { clientId } = req.query;
  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'Missing clientId' });
  }

  try {
    // Proxy to Java backend, passing X-Client-ID so TenantInterceptor
    // sets the correct tenant context for this request.
    const raw = await backendFetch(
      '/v1/products',
      {
        method: 'GET',
        headers: { 'X-Client-ID': clientId },
      },
      req,
    );

    // Backend wraps response in ApiResponse<T> -> unwrap .data
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : [];

    // Filter to only available, active, non-ingredient products
    const available = list.filter(
      p => p.isAvailable !== false && p.isActive !== false && p.isIngredient !== true
    );

    // Sanitise each product to only what the menu page needs
    const items = available.map(p => ({
      id:           String(p.id),
      name:         p.name || '',
      description:  p.description || null,
      price:        p.price != null ? Number(p.price) : 0,
      imageUrl:     p.imageUrl || null,
      categoryId:   p.categoryId ? String(p.categoryId) : null,
      categoryName: p.categoryName || 'Other',
      hasVariants:  Boolean(p.hasVariants),
      variantCount: Number(p.variantCount) || 0,
      taxRate:      p.taxRate != null ? Number(p.taxRate) : null,
      productCode:  p.productCode || null,
    }));

    // Group by categoryName, preserving first-seen order
    const sectionMap = new Map();
    for (const item of items) {
      const key = item.categoryName;
      if (!sectionMap.has(key)) {
        sectionMap.set(key, {
          category:   key,
          categoryId: item.categoryId,
          items:      [],
        });
      }
      sectionMap.get(key).items.push(item);
    }

    const sections = Array.from(sectionMap.values());

    return res.status(200).json({ clientId, sections });
  } catch (err) {
    console.error('[api/menu]', clientId, err.message);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to load menu' });
  }
}

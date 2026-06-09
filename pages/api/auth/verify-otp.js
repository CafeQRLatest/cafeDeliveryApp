// pages/api/auth/verify-otp.js
// Thin proxy → POST https://cafe-qr-backend.onrender.com/api/v1/auth/customer/verify-otp
//
// The backend verifies the OTP against Redis, deletes it on success, and
// returns { verified: true, email, name, phone }.
//
// On success, this route issues a signed HttpOnly delivery_session cookie
// (HMAC-SHA256 via lib/auth.js) so the browser is authenticated for all
// subsequent API calls without re-sending credentials.
//
// Request body:  { email, otp, name?, phone? }
// Response 200:  { verified: true, email, name, phone }  + Set-Cookie
// Response 4xx:  { error: string }

import {
  buildSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
} from '@/lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, otp, name = '', phone = '' } = req.body || {};

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL ||
    'https://cafe-qr-backend.onrender.com/api';

  try {
    const upstream = await fetch(`${backendUrl}/v1/auth/customer/verify-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, otp }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const message =
        data?.message ||
        data?.error   ||
        `Verification failed (${upstream.status})`;
      return res.status(upstream.status).json({ error: message });
    }

    // ── OTP verified — issue session cookie ──────────────────────────────────
    // The backend returns { verified, email, name?, phone? }
    // If the customer has a name/phone from a previous signup, use them.
    const resolvedName  = data?.data?.name  || name  || '';
    const resolvedPhone = data?.data?.phone || phone || '';
    const resolvedEmail = data?.data?.email || email;

    const token = buildSessionToken({
      email: resolvedEmail,
      name:  resolvedName,
      phone: resolvedPhone,
    });

    const isProduction = process.env.APP_ENV !== 'development';

    const cookieParts = [
      `${SESSION_COOKIE_NAME}=${token}`,
      `Max-Age=${SESSION_MAX_AGE_SEC}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
    ];
    if (isProduction) cookieParts.push('Secure');

    res.setHeader('Set-Cookie', cookieParts.join('; '));

    return res.status(200).json({
      verified: true,
      email:    resolvedEmail,
      name:     resolvedName,
      phone:    resolvedPhone,
    });
  } catch (err) {
    console.error('[verify-otp proxy]', err.message);
    return res.status(502).json({ error: 'Could not reach authentication server. Please try again.' });
  }
}

// pages/api/auth/send-otp.js
// Thin proxy → POST https://cafe-qr-backend.onrender.com/api/v1/auth/send-otp
//
// The Spring Boot backend owns OTP generation, Redis storage, and email
// dispatch via SMTP (configured in Render env vars).
// The frontend has ZERO email credentials — it just forwards the request.
//
// Request body:  { email: string }
// Response 200:  { success: true, message: string }
// Response 4xx:  { error: string }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL ||
    'https://cafe-qr-backend.onrender.com/api';

  try {
    const upstream = await fetch(`${backendUrl}/v1/auth/send-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      // Forward the backend error message if present
      const message =
        data?.message ||
        data?.error   ||
        `Backend returned ${upstream.status}`;
      return res.status(upstream.status).json({ error: message });
    }

    return res.status(200).json({ success: true, message: data?.data || 'OTP sent' });
  } catch (err) {
    console.error('[send-otp proxy]', err.message);
    return res.status(502).json({ error: 'Could not reach authentication server. Please try again.' });
  }
}

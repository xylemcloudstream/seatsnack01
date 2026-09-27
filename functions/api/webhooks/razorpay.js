import { getDb } from '../../_lib/db.js';

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Configure this URL + a webhook secret in the Razorpay dashboard
// (Settings > Webhooks), subscribed to the `payment.captured` event.
// This is a safety net only — the primary confirmation path is the
// client-side verify in /api/orders/verify.
export async function onRequestPost({ request, env }) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  const expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, rawBody);
  if (signature !== expected) return new Response('Invalid signature', { status: 400 });

  const payload = JSON.parse(rawBody);
  if (payload.event === 'payment.captured') {
    const payment = payload.payload.payment.entity;
    const sql = getDb(env);
    await sql`
      update orders set status = 'paid', razorpay_payment_id = ${payment.id}, paid_at = now(),
        razorpay_fee = ${(payment.fee || 0) / 100}, razorpay_tax = ${(payment.tax || 0) / 100}
      where razorpay_order_id = ${payment.order_id} and status = 'pending_payment'
    `;
  }
  return new Response('ok');
}

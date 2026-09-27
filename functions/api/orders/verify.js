import { getDb, json, badRequest } from '../../_lib/db.js';
import { verifySession } from '../../_lib/auth.js';

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  const session = await verifySession(request, env);
  if (!session || session.role !== 'customer') return badRequest('Sign in to order', 401);

  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json().catch(() => ({}));
  if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return badRequest('Missing payment verification fields');
  }

  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (expected !== razorpay_signature) return badRequest('Payment signature mismatch', 400);

  const sql = getDb(env);
  const [order] = await sql`
    update orders set status = 'paid', razorpay_payment_id = ${razorpay_payment_id}, paid_at = now()
    where id = ${orderId} and customer_id = ${session.customerId} and razorpay_order_id = ${razorpay_order_id}
    returning id, status, seat_id
  `;
  if (!order) return badRequest('Order not found', 404);

  return json({ ok: true, order });
}

import { getDb, json, badRequest } from '../../../../../../_lib/db.js';
import { verifySession, isSuperadmin } from '../../../../../../_lib/auth.js';

const ALLOWED = ['preparing', 'delivered'];

export async function onRequestPatch({ params, request, env }) {
  const session = await verifySession(request, env);
  if (!session) return badRequest('Not signed in', 401);

  const sql = getDb(env);
  const [theatre] = await sql`select id from theatres where slug = ${params.slug}`;
  if (!theatre) return badRequest('Theatre not found', 404);

  const authorized = isSuperadmin(session.email, env) ||
    ((session.role === 'admin' || session.role === 'staff') && session.theatreId === theatre.id);
  if (!authorized) return badRequest('Not authorized', 403);

  const { status } = await request.json().catch(() => ({}));
  if (!ALLOWED.includes(status)) return badRequest('status must be preparing or delivered');

  const deliveredAt = status === 'delivered' ? sql`now()` : null;
  const [order] = await sql`
    update orders set status = ${status}, delivered_at = ${status === 'delivered' ? new Date().toISOString() : null}
    where id = ${params.orderId} and theatre_id = ${theatre.id}
    returning id, status
  `;
  if (!order) return badRequest('Order not found', 404);
  return json({ order });
}

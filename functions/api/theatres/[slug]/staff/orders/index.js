import { getDb, json, badRequest } from '../../../../../_lib/db.js';
import { verifySession, isSuperadmin } from '../../../../../_lib/auth.js';

export async function onRequestGet({ params, request, env }) {
  const session = await verifySession(request, env);
  if (!session) return badRequest('Not signed in', 401);

  const sql = getDb(env);
  const [theatre] = await sql`select id from theatres where slug = ${params.slug}`;
  if (!theatre) return badRequest('Theatre not found', 404);

  const authorized = isSuperadmin(session.email, env) ||
    ((session.role === 'admin' || session.role === 'staff') && session.theatreId === theatre.id);
  if (!authorized) return badRequest('Not authorized', 403);

  const orders = await sql`
    select o.id, o.status, o.subtotal, o.created_at,
           s.seat_code, s.row_label, s.seat_number,
           c.phone as customer_phone, c.name as customer_name,
           sh.title as show_title
    from orders o
      join seats s on s.id = o.seat_id
      join customers c on c.id = o.customer_id
      join shows sh on sh.id = o.show_id
    where o.theatre_id = ${theatre.id}
      and o.status in ('paid','preparing','delivered')
      and sh.status = 'running'
    order by o.created_at asc
  `;

  const orderIds = orders.map(o => o.id);
  const items = orderIds.length
    ? await sql`select order_id, name_at_order, quantity, price_at_order from order_items where order_id = any(${orderIds})`
    : [];

  const byOrder = {};
  for (const it of items) {
    (byOrder[it.order_id] ||= []).push({ name: it.name_at_order, qty: it.quantity, price: it.price_at_order });
  }

  return json({
    orders: orders.map(o => ({
      id: o.id,
      status: o.status,
      subtotal: o.subtotal,
      createdAt: o.created_at,
      seat: `${o.row_label}${o.seat_number}`,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      showTitle: o.show_title,
      items: byOrder[o.id] || []
    }))
  });
}

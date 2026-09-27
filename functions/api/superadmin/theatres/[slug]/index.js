import { getDb, json, badRequest } from '../../../../_lib/db.js';
import { verifySession, isSuperadmin } from '../../../../_lib/auth.js';

export async function onRequestGet({ params, request, env }) {
  const session = await verifySession(request, env);
  if (!session || !isSuperadmin(session.email, env)) return badRequest('Superadmin only', 403);

  const sql = getDb(env);
  const [theatre] = await sql`select * from theatres where slug = ${params.slug}`;
  if (!theatre) return badRequest('Theatre not found', 404);

  const [screens, staff, menuItems, seatCounts, recentOrders] = await Promise.all([
    sql`select id, name from screens where theatre_id = ${theatre.id}`,
    sql`select email, role from theatre_staff where theatre_id = ${theatre.id}`,
    sql`select id, name, price, is_available from menu_items where theatre_id = ${theatre.id} order by sort_order`,
    sql`
      select sc.name as class_name, count(*) as seat_count
      from seats s join seat_classes sc on sc.id = s.seat_class_id
        join screens scr on scr.id = s.screen_id
      where scr.theatre_id = ${theatre.id}
      group by sc.name
    `,
    sql`
      select o.id, o.status, o.subtotal, o.created_at, s.seat_code
      from orders o join seats s on s.id = o.seat_id
      where o.theatre_id = ${theatre.id}
      order by o.created_at desc limit 50
    `
  ]);

  return json({ theatre, screens, staff, menuItems, seatCounts, recentOrders });
}

export async function onRequestPatch({ params, request, env }) {
  const session = await verifySession(request, env);
  if (!session || !isSuperadmin(session.email, env)) return badRequest('Superadmin only', 403);

  const body = await request.json().catch(() => ({}));
  const sql = getDb(env);
  const [theatre] = await sql`
    update theatres set
      name = coalesce(${body.name}, name),
      ordering_window_minutes = coalesce(${body.orderingWindowMinutes}, ordering_window_minutes),
      is_active = coalesce(${body.isActive}, is_active)
    where slug = ${params.slug}
    returning id, slug, name, ordering_window_minutes, is_active
  `;
  if (!theatre) return badRequest('Theatre not found', 404);
  return json({ theatre });
}

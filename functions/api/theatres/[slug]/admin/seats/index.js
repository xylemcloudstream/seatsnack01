import { getDb, json, badRequest } from '../../../../../_lib/db.js';
import { verifySession, isSuperadmin } from '../../../../../_lib/auth.js';

export async function onRequestGet({ params, request, env }) {
  const session = await verifySession(request, env);
  if (!session) return badRequest('Not signed in', 401);

  const sql = getDb(env);
  const [theatre] = await sql`select id from theatres where slug = ${params.slug}`;
  if (!theatre) return badRequest('Theatre not found', 404);

  const authorized = isSuperadmin(session.email, env) || (session.role === 'admin' && session.theatreId === theatre.id);
  if (!authorized) return badRequest('Not authorized', 403);

  const seats = await sql`
    select s.seat_code, s.row_label, s.seat_number, sc.name as class_name, scr.name as screen_name
    from seats s
      join seat_classes sc on sc.id = s.seat_class_id
      join screens scr on scr.id = s.screen_id
    where scr.theatre_id = ${theatre.id} and s.is_active = true
    order by scr.name, sc.name, s.row_label, s.seat_number
  `;
  return json({ seats });
}

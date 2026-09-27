import { getDb, json, badRequest } from '../../../../../_lib/db.js';
import { verifySession, isSuperadmin } from '../../../../../_lib/auth.js';

// Any signed-in staff/admin of the theatre (or superadmin) can start a show
// for a screen. This closes any previous "running" show for that screen and
// opens a fresh ordering window (default: theatre's ordering_window_minutes,
// e.g. the first 90 minutes / 1.5 hours — configurable per theatre).
export async function onRequestPost({ params, request, env }) {
  const session = await verifySession(request, env);
  if (!session) return badRequest('Not signed in', 401);

  const sql = getDb(env);
  const [theatre] = await sql`select id, ordering_window_minutes from theatres where slug = ${params.slug}`;
  if (!theatre) return badRequest('Theatre not found', 404);

  const authorized = isSuperadmin(session.email, env) ||
    ((session.role === 'admin' || session.role === 'staff') && session.theatreId === theatre.id);
  if (!authorized) return badRequest('Not authorized', 403);

  const body = await request.json().catch(() => ({}));
  if (!body.screenName) return badRequest('screenName is required');

  const [screen] = await sql`select id from screens where theatre_id = ${theatre.id} and name = ${body.screenName}`;
  if (!screen) return badRequest('Screen not found', 404);

  await sql`update shows set status = 'ended' where screen_id = ${screen.id} and status = 'running'`;

  const windowMinutes = body.orderingWindowMinutes || theatre.ordering_window_minutes;
  const [show] = await sql`
    insert into shows (screen_id, title, started_at, ordering_closes_at)
    values (${screen.id}, ${body.title || 'Now Showing'}, now(), now() + (${windowMinutes} || ' minutes')::interval)
    returning id, started_at, ordering_closes_at
  `;
  return json({ show });
}

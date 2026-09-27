import { getDb, json, badRequest } from '../../../../../_lib/db.js';
import { verifySession, isSuperadmin } from '../../../../../_lib/auth.js';

async function authorizeAdmin({ params, request, env, sql }) {
  const session = await verifySession(request, env);
  if (!session) return { error: badRequest('Not signed in', 401) };
  const [theatre] = await sql`select id from theatres where slug = ${params.slug}`;
  if (!theatre) return { error: badRequest('Theatre not found', 404) };
  const ok = isSuperadmin(session.email, env) || (session.role === 'admin' && session.theatreId === theatre.id);
  if (!ok) return { error: badRequest('Not authorized', 403) };
  return { theatre };
}

export async function onRequestGet({ params, request, env }) {
  const sql = getDb(env);
  const { theatre, error } = await authorizeAdmin({ params, request, env, sql });
  if (error) return error;
  const staff = await sql`select email, role, created_at from theatre_staff where theatre_id = ${theatre.id} order by created_at`;
  return json({ staff });
}

export async function onRequestPost({ params, request, env }) {
  const sql = getDb(env);
  const { theatre, error } = await authorizeAdmin({ params, request, env, sql });
  if (error) return error;

  const { email, role } = await request.json().catch(() => ({}));
  // Theatre admins can only add 'staff' logins — only a superadmin creates
  // new theatres (and thus new 'admin' owner accounts).
  if (!email || role !== 'staff') return badRequest("email is required and role must be 'staff'");

  await sql`
    insert into theatre_staff (theatre_id, email, role) values (${theatre.id}, ${email.toLowerCase()}, 'staff')
    on conflict (theatre_id, email) do nothing
  `;
  return json({ ok: true }, { status: 201 });
}

import { getDb, json, badRequest } from '../../../../../_lib/db.js';
import { verifySession, isSuperadmin } from '../../../../../_lib/auth.js';

async function authorize({ params, request, env, sql }) {
  const session = await verifySession(request, env);
  if (!session) return { error: badRequest('Not signed in', 401) };
  const [theatre] = await sql`select id from theatres where slug = ${params.slug}`;
  if (!theatre) return { error: badRequest('Theatre not found', 404) };
  const ok = isSuperadmin(session.email, env) || (session.role === 'admin' && session.theatreId === theatre.id);
  if (!ok) return { error: badRequest('Not authorized', 403) };
  return { theatre };
}

export async function onRequestPatch({ params, request, env }) {
  const sql = getDb(env);
  const { theatre, error } = await authorize({ params, request, env, sql });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const [item] = await sql`
    update menu_items set
      name = coalesce(${body.name}, name),
      description = coalesce(${body.description}, description),
      price = coalesce(${body.price}, price),
      image_url = coalesce(${body.imageUrl}, image_url),
      is_available = coalesce(${body.isAvailable}, is_available)
    where id = ${params.itemId} and theatre_id = ${theatre.id}
    returning id, name, description, price, image_url, is_available
  `;
  if (!item) return badRequest('Menu item not found', 404);
  return json({ item });
}

export async function onRequestDelete({ params, request, env }) {
  const sql = getDb(env);
  const { theatre, error } = await authorize({ params, request, env, sql });
  if (error) return error;
  await sql`delete from menu_items where id = ${params.itemId} and theatre_id = ${theatre.id}`;
  return json({ ok: true });
}

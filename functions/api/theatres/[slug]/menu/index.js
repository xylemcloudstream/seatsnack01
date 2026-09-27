import { getDb, json, badRequest } from '../../../../_lib/db.js';
import { verifySession, isSuperadmin } from '../../../../_lib/auth.js';

export async function onRequestGet({ params, env }) {
  const { slug } = params;
  const sql = getDb(env);
  const [theatre] = await sql`select id from theatres where slug = ${slug}`;
  if (!theatre) return badRequest('Theatre not found', 404);

  const items = await sql`
    select id, name, description, price, image_url, is_available
    from menu_items
    where theatre_id = ${theatre.id} and is_available = true
    order by sort_order, name
  `;
  return json({ items });
}

// Theatre admin (or superadmin) adds/edits menu items here too, since the
// prompt asked for menu management on both the theatre dashboard and the
// superadmin dashboard.
export async function onRequestPost({ params, request, env }) {
  const { slug } = params;
  const session = await verifySession(request, env);
  if (!session) return badRequest('Not signed in', 401);

  const sql = getDb(env);
  const [theatre] = await sql`select id from theatres where slug = ${slug}`;
  if (!theatre) return badRequest('Theatre not found', 404);

  const authorized = isSuperadmin(session.email, env) ||
    (session.role === 'admin' && session.theatreId === theatre.id);
  if (!authorized) return badRequest('Not authorized for this theatre', 403);

  const body = await request.json().catch(() => ({}));
  if (!body.name || body.price == null) return badRequest('name and price are required');

  const [item] = await sql`
    insert into menu_items (theatre_id, name, description, price, image_url, sort_order)
    values (${theatre.id}, ${body.name}, ${body.description || null}, ${body.price}, ${body.imageUrl || null}, ${body.sortOrder || 0})
    returning id, name, description, price, image_url, is_available
  `;
  return json({ item }, { status: 201 });
}

import { getDb, json, badRequest } from '../../../_lib/db.js';
import { verifySession, isSuperadmin } from '../../../_lib/auth.js';

function requireSuperadmin(session, env) {
  return session && isSuperadmin(session.email, env);
}

export async function onRequestGet({ request, env }) {
  const session = await verifySession(request, env);
  if (!requireSuperadmin(session, env)) return badRequest('Superadmin only', 403);

  const sql = getDb(env);
  const theatres = await sql`
    select t.id, t.slug, t.name, t.owner_email, t.is_active, t.created_at,
      (select count(*) from screens where theatre_id = t.id) as screen_count,
      (select count(*) from menu_items where theatre_id = t.id) as menu_count
    from theatres t order by t.created_at desc
  `;
  return json({ theatres });
}

// Body:
// {
//   slug, name, ownerEmail,
//   orderingWindowMinutes?,
//   screen: { name },
//   seatClasses: [{ name, price }],
//   seats: [{ row, number, seatCode, className }],   // className must match a seatClasses.name
//   menuItems?: [{ name, price, description? }]
// }
export async function onRequestPost({ request, env }) {
  const session = await verifySession(request, env);
  if (!requireSuperadmin(session, env)) return badRequest('Superadmin only', 403);

  const body = await request.json().catch(() => ({}));
  const { slug, name, ownerEmail, screen, seatClasses, seats } = body;
  if (!slug || !name || !ownerEmail || !screen?.name || !Array.isArray(seatClasses) || !Array.isArray(seats)) {
    return badRequest('slug, name, ownerEmail, screen.name, seatClasses[] and seats[] are required');
  }

  const sql = getDb(env);

  const existing = await sql`select id from theatres where slug = ${slug}`;
  if (existing.length) return badRequest('That slug is already taken', 409);

  const [theatre] = await sql`
    insert into theatres (slug, name, owner_email, ordering_window_minutes)
    values (${slug}, ${name}, ${ownerEmail.toLowerCase()}, ${body.orderingWindowMinutes || 90})
    returning id
  `;
  await sql`insert into theatre_staff (theatre_id, email, role) values (${theatre.id}, ${ownerEmail.toLowerCase()}, 'admin')`;

  const [screenRow] = await sql`insert into screens (theatre_id, name) values (${theatre.id}, ${screen.name}) returning id`;

  const classIdByName = {};
  for (const [i, c] of seatClasses.entries()) {
    const [row] = await sql`insert into seat_classes (screen_id, name, price, sort_order) values (${screenRow.id}, ${c.name}, ${c.price}, ${i}) returning id`;
    classIdByName[c.name] = row.id;
  }

  // Batch insert seats. For a few hundred seats this is fine as sequential
  // inserts on Neon's HTTP driver; swap for a multi-row VALUES batch if you
  // scale to many theatres seeded at once.
  for (const s of seats) {
    const classId = classIdByName[s.className];
    if (!classId) continue;
    await sql`
      insert into seats (screen_id, seat_class_id, row_label, seat_number, seat_code)
      values (${screenRow.id}, ${classId}, ${s.row}, ${s.number}, ${s.seatCode})
      on conflict do nothing
    `;
  }

  if (Array.isArray(body.menuItems)) {
    for (const [i, m] of body.menuItems.entries()) {
      await sql`
        insert into menu_items (theatre_id, name, description, price, sort_order)
        values (${theatre.id}, ${m.name}, ${m.description || null}, ${m.price}, ${i})
      `;
    }
  }

  return json({ theatreId: theatre.id, slug }, { status: 201 });
}

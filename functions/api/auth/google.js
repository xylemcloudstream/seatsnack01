import { getDb, json, badRequest } from '../../_lib/db.js';
import { verifyGoogleIdToken, signSession, isSuperadmin } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body?.credential) return badRequest('Missing Google credential');

  let google;
  try {
    google = await verifyGoogleIdToken(body.credential, env);
  } catch (e) {
    return badRequest('Invalid Google token: ' + e.message, 401);
  }

  const sql = getDb(env);
  const { email, name, picture } = google;

  // 1. Superadmin — hardcoded allowlist, never stored in the DB.
  if (isSuperadmin(email, env)) {
    const token = await signSession({ email, name, role: 'superadmin' }, env);
    return json({ token, role: 'superadmin', email, name, picture });
  }

  // 2. Theatre staff/admin — look up membership across all theatres.
  const staffRows = await sql`
    select ts.role, ts.theatre_id, t.slug, t.name as theatre_name
    from theatre_staff ts join theatres t on t.id = ts.theatre_id
    where ts.email = ${email}
  `;
  if (staffRows.length > 0) {
    // A person can in theory staff more than one theatre; if so, the frontend
    // lets them pick. We include the full list plus a default session for the first.
    const memberships = staffRows.map(r => ({ role: r.role, theatreId: r.theatre_id, slug: r.slug, theatreName: r.theatre_name }));
    const primary = memberships[0];
    const token = await signSession({ email, name, role: primary.role, theatreId: primary.theatreId, slug: primary.slug }, env);
    return json({ token, role: primary.role, email, name, picture, slug: primary.slug, theatreName: primary.theatreName, memberships });
  }

  // 3. Audience / customer — upsert a customer row, ask for phone if missing.
  const [customer] = await sql`
    insert into customers (email, name)
    values (${email}, ${name})
    on conflict (email) do update set name = excluded.name
    returning id, phone
  `;
  const token = await signSession({ email, name, role: 'customer', customerId: customer.id }, env);
  return json({ token, role: 'customer', email, name, picture, phoneRequired: !customer.phone });
}

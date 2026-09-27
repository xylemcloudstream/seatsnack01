import { getDb, json, badRequest } from '../../_lib/db.js';
import { verifySession } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const session = await verifySession(request, env);
  if (!session || session.role !== 'customer') return badRequest('Not signed in', 401);

  const { phone } = await request.json().catch(() => ({}));
  if (!phone || !/^[+]?[0-9]{10,15}$/.test(phone.replace(/[\s-]/g, ''))) {
    return badRequest('Enter a valid mobile number');
  }

  const sql = getDb(env);
  await sql`update customers set phone = ${phone} where id = ${session.customerId}`;
  return json({ ok: true });
}

import { neon } from '@neondatabase/serverless';

// One `sql` tagged-template client per request. Neon's serverless driver
// works over HTTP (fetch), so it's safe to create per-invocation on
// Cloudflare Pages Functions — no connection pooling needed for this scale.
export function getDb(env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set (Cloudflare Pages > Settings > Environment variables)');
  }
  return neon(env.DATABASE_URL);
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      ...(init.headers || {})
    }
  });
}

export function badRequest(message, status = 400) {
  return json({ error: message }, { status });
}

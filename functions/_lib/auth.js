import { jwtVerify, SignJWT, createRemoteJWKSet } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

// Verify a Google Identity Services id_token (the `credential` the frontend
// gets back from the Google Sign-In button). Returns { email, name, picture }.
export async function verifyGoogleIdToken(idToken, env) {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID
  });
  if (!payload.email_verified) throw new Error('Google email not verified');
  return { email: payload.email.toLowerCase(), name: payload.name, picture: payload.picture };
}

function secretKey(env) {
  return new TextEncoder().encode(env.APP_JWT_SECRET);
}

// Our own short-lived session token, issued after we've verified Google's
// token once and looked up the person's role. Cheap to verify on every
// subsequent request (no network call, unlike re-checking Google each time).
export async function signSession(claims, env) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secretKey(env));
}

export async function verifySession(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(env));
    return payload; // { email, name, role, theatreId? }
  } catch {
    return null;
  }
}

export function isSuperadmin(email, env) {
  const list = (env.SUPERADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes((email || '').toLowerCase());
}

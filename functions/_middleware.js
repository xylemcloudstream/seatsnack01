export async function onRequest(context) {
  const { request, next } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type, authorization'
      }
    });
  }
  const res = await next();
  res.headers.set('access-control-allow-origin', '*');
  return res;
}

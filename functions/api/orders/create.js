import { getDb, json, badRequest } from '../../_lib/db.js';
import { verifySession } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const session = await verifySession(request, env);
  if (!session || session.role !== 'customer') return badRequest('Sign in to order', 401);

  const sql = getDb(env);
  const [customer] = await sql`select id, phone from customers where id = ${session.customerId}`;
  if (!customer?.phone) return badRequest('Add your mobile number first', 409);

  const body = await request.json().catch(() => ({}));
  const { theatreSlug, seatCode, items } = body;
  if (!theatreSlug || !seatCode || !Array.isArray(items) || items.length === 0) {
    return badRequest('theatreSlug, seatCode and items are required');
  }

  const [theatre] = await sql`select id from theatres where slug = ${theatreSlug} and is_active = true`;
  if (!theatre) return badRequest('Theatre not found', 404);

  const [seat] = await sql`
    select s.id, s.screen_id from seats s
      join screens scr on scr.id = s.screen_id
    where scr.theatre_id = ${theatre.id} and s.seat_code = ${seatCode} and s.is_active = true
  `;
  if (!seat) return badRequest('Seat not found', 404);

  const [show] = await sql`
    select id, ordering_closes_at from shows
    where screen_id = ${seat.screen_id} and status = 'running'
    order by started_at desc limit 1
  `;
  if (!show || new Date(show.ordering_closes_at) <= new Date()) {
    return badRequest('Food ordering has closed for this show', 409);
  }

  // Price every line item straight from the DB — the client only sends ids + quantities.
  const menuItemIds = items.map((i) => i.menuItemId);
  const dbItems = await sql`select id, name, price from menu_items where id = any(${menuItemIds}) and theatre_id = ${theatre.id} and is_available = true`;
  const priceById = Object.fromEntries(dbItems.map((d) => [d.id, d]));

  let subtotal = 0;
  const lineItems = [];
  for (const { menuItemId, quantity } of items) {
    const item = priceById[menuItemId];
    if (!item || !(quantity > 0)) return badRequest('Invalid item in cart');
    subtotal += Number(item.price) * quantity;
    lineItems.push({ menuItemId, name: item.name, price: item.price, quantity });
  }
  if (subtotal <= 0) return badRequest('Cart is empty');

  const [order] = await sql`
    insert into orders (theatre_id, show_id, seat_id, customer_id, subtotal, status)
    values (${theatre.id}, ${show.id}, ${seat.id}, ${customer.id}, ${subtotal}, 'pending_payment')
    returning id
  `;
  for (const li of lineItems) {
    await sql`
      insert into order_items (order_id, menu_item_id, name_at_order, price_at_order, quantity)
      values (${order.id}, ${li.menuItemId}, ${li.name}, ${li.price}, ${li.quantity})
    `;
  }

  // Razorpay amount is in paise. The customer pays exactly `subtotal` — same
  // price as buying at the counter; the theatre absorbs Razorpay's fee + GST.
  const rpRes = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)
    },
    body: JSON.stringify({
      amount: Math.round(subtotal * 100),
      currency: 'INR',
      receipt: order.id,
      notes: { theatreSlug, seatCode, orderId: order.id }
    })
  });
  if (!rpRes.ok) {
    const errText = await rpRes.text();
    return badRequest('Payment gateway error: ' + errText, 502);
  }
  const rpOrder = await rpRes.json();

  await sql`update orders set razorpay_order_id = ${rpOrder.id} where id = ${order.id}`;

  return json({
    orderId: order.id,
    razorpayOrderId: rpOrder.id,
    amount: rpOrder.amount,
    currency: rpOrder.currency,
    razorpayKeyId: env.RAZORPAY_KEY_ID
  }, { status: 201 });
}

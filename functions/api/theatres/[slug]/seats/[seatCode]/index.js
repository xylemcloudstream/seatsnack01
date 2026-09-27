import { getDb, json, badRequest } from '../../../../../_lib/db.js';

export async function onRequestGet({ params, env }) {
  const { slug, seatCode } = params;
  const sql = getDb(env);

  const [theatre] = await sql`select id, name, slug from theatres where slug = ${slug} and is_active = true`;
  if (!theatre) return badRequest('Theatre not found', 404);

  const [seat] = await sql`
    select s.id, s.row_label, s.seat_number, s.seat_code, s.screen_id,
           sc.name as class_name, sc.price as ticket_price,
           scr.name as screen_name
    from seats s
      join seat_classes sc on sc.id = s.seat_class_id
      join screens scr on scr.id = s.screen_id
    where scr.theatre_id = ${theatre.id} and s.seat_code = ${seatCode} and s.is_active = true
  `;
  if (!seat) return badRequest('Seat not found for this theatre', 404);

  const [show] = await sql`
    select id, title, started_at, ordering_closes_at
    from shows
    where screen_id = ${seat.screen_id} and status = 'running'
    order by started_at desc
    limit 1
  `;

  const now = new Date();
  const orderingOpen = !!show && new Date(show.ordering_closes_at) > now;

  return json({
    theatre: { slug: theatre.slug, name: theatre.name },
    screen: { name: seat.screen_name },
    seat: { code: seat.seat_code, row: seat.row_label, number: seat.seat_number, class: seat.class_name },
    show: show ? { id: show.id, title: show.title, orderingClosesAt: show.ordering_closes_at } : null,
    orderingOpen
  });
}

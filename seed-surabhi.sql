-- ============================================================================
-- seed-surabhi.sql
-- Creates the "Surabhi" theatre, its "4K LASER" screen, and reconstructs the
-- seat matrix from the booking-site screenshots you shared.
--
-- NOTE ON THE SEAT MATRIX: booked seats in the screenshots showed as "×" with
-- no visible number, so exact seat counts in a couple of spots are a
-- best-effort reconstruction, not a pixel-perfect read. What I could read
-- reliably:
--   BOX (₹160): row B (9 seats), row A (10 seats) — all shown booked/"×"
--   GOLD (₹150):
--     row I:            seats 1-37, one continuous row (no centre aisle gap)
--     rows H, G:        seats 1-8, then a gap with no seats, then 26-33
--     rows F,E,D,C,B:   seats 1-8, then 9-25, then 26-33
--     row A:             seats 4-8 (no 1-3), then 9-25, then 26-30 (no 31-33)
-- Adjust freely from the superadmin "Seat Matrix" editor after seeding —
-- nothing here is hardcoded into the app logic.
-- ============================================================================

-- Replace this with the Google account that should log in as Surabhi's
-- theatre admin before running (or update it later from the superadmin
-- dashboard: it's just a row in theatre_staff).
\set owner_email 'owner@surabhi-theatre.example'

with new_theatre as (
  insert into theatres (slug, name, owner_email, ordering_window_minutes)
  values ('surabhi', 'Surabhi Theatre', :'owner_email', 90)
  returning id
),
new_screen as (
  insert into screens (theatre_id, name)
  select id, '4K LASER' from new_theatre
  returning id, theatre_id
),
new_classes as (
  insert into seat_classes (screen_id, name, price, sort_order)
  select id, 'BOX', 160, 1 from new_screen
  union all
  select id, 'GOLD', 150, 2 from new_screen
  returning id, screen_id, name
),
staff_row as (
  insert into theatre_staff (theatre_id, email, role)
  select theatre_id, :'owner_email', 'admin' from new_screen
  returning 1
)
select 1;

-- Grab the ids we just made (Neon's psql driver runs this file as one session,
-- so these selects see the rows inserted above).
do $$
declare
  v_screen_id uuid;
  v_box_id uuid;
  v_gold_id uuid;
  v_theatre_id uuid;
begin
  select s.id, s.theatre_id into v_screen_id, v_theatre_id
    from screens s join theatres t on t.id = s.theatre_id
    where t.slug = 'surabhi' and s.name = '4K LASER';

  select id into v_box_id from seat_classes where screen_id = v_screen_id and name = 'BOX';
  select id into v_gold_id from seat_classes where screen_id = v_screen_id and name = 'GOLD';

  -- ---- BOX ----
  insert into seats (screen_id, seat_class_id, row_label, seat_number, seat_code)
  select v_screen_id, v_box_id, 'A', n, 'A' || n from generate_series(1,10) n
  union all
  select v_screen_id, v_box_id, 'B', n, 'B' || n from generate_series(1,9) n;

  -- ---- GOLD ----
  -- Row I: continuous 1-37
  insert into seats (screen_id, seat_class_id, row_label, seat_number, seat_code)
  select v_screen_id, v_gold_id, 'I', n, 'I' || n from generate_series(1,37) n;

  -- Rows H, G: 1-8 and 26-33 (middle section has no seats)
  insert into seats (screen_id, seat_class_id, row_label, seat_number, seat_code)
  select v_screen_id, v_gold_id, r, n, r || n
  from unnest(array['H','G']) r,
       generate_series(1,8) n
  union all
  select v_screen_id, v_gold_id, r, n, r || n
  from unnest(array['H','G']) r,
       generate_series(26,33) n;

  -- Rows F,E,D,C,B: 1-8, 9-25, 26-33
  insert into seats (screen_id, seat_class_id, row_label, seat_number, seat_code)
  select v_screen_id, v_gold_id, r, n, r || n
  from unnest(array['F','E','D','C','B']) r,
       generate_series(1,33) n;

  -- Row A: 4-8, 9-25, 26-30 (no 1-3, no 31-33)
  insert into seats (screen_id, seat_class_id, row_label, seat_number, seat_code)
  select v_screen_id, v_gold_id, 'A', n, 'A' || n
  from generate_series(4,30) n;

  -- ---- Starter menu ----
  insert into menu_items (theatre_id, name, description, price, sort_order)
  values
    (v_theatre_id, 'Cheese Popcorn', 'Freshly popped, loaded with cheese seasoning', 150, 1),
    (v_theatre_id, 'Pepsi', 'Chilled 500ml', 60, 2);
end $$;

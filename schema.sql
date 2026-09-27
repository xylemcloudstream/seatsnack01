-- ============================================================================
-- Theatre In-Seat Food Ordering Kit — schema.sql
-- Target: NeonDB (Postgres, serverless driver over HTTP/WebSocket)
-- Run once against your Neon database:
--   psql "$DATABASE_URL" -f schema.sql
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- THEATRES
-- Only a superadmin can insert rows here (see functions/api/superadmin).
-- owner_email is the Google account that logs in as this theatre's admin.
-- ---------------------------------------------------------------------------
create table theatres (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,             -- e.g. 'surabhi'
  name              text not null,                     -- e.g. 'Surabhi Theatre'
  owner_email       text not null,                     -- google account, theatre admin
  ordering_window_minutes integer not null default 90, -- food ordering open for this long after a show starts
  logo_url          text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Every google account that is allowed to act as staff/admin for a theatre.
-- role = 'admin'  -> full theatre dashboard (menu, seat matrix, shows, staff mgmt)
-- role = 'staff'  -> order fulfillment dashboard only
create table theatre_staff (
  id           uuid primary key default gen_random_uuid(),
  theatre_id   uuid not null references theatres(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('admin','staff')),
  created_at   timestamptz not null default now(),
  unique(theatre_id, email)
);

-- ---------------------------------------------------------------------------
-- SCREENS / SEATS
-- ---------------------------------------------------------------------------
create table screens (
  id           uuid primary key default gen_random_uuid(),
  theatre_id   uuid not null references theatres(id) on delete cascade,
  name         text not null,          -- e.g. '4K LASER'
  created_at   timestamptz not null default now(),
  unique(theatre_id, name)
);

create table seat_classes (
  id           uuid primary key default gen_random_uuid(),
  screen_id    uuid not null references screens(id) on delete cascade,
  name         text not null,          -- 'BOX', 'GOLD'
  price        numeric(10,2) not null, -- ticket price, informational only
  sort_order   integer not null default 0
);

create table seats (
  id             uuid primary key default gen_random_uuid(),
  screen_id      uuid not null references screens(id) on delete cascade,
  seat_class_id  uuid not null references seat_classes(id) on delete cascade,
  row_label      text not null,        -- 'A'..'I'
  seat_number    integer not null,     -- 1..37
  seat_code      text not null,        -- 'A4', 'I23' — what the QR code encodes
  is_active      boolean not null default true,
  unique(screen_id, seat_code)
);
create index idx_seats_screen on seats(screen_id);

-- ---------------------------------------------------------------------------
-- SHOWS
-- Staff/admin "starts" a show when the movie begins; that sets the ordering
-- window (default: first 90 minutes). The QR code always points at a screen;
-- the API resolves the currently-running show for that screen automatically.
-- ---------------------------------------------------------------------------
create table shows (
  id                 uuid primary key default gen_random_uuid(),
  screen_id          uuid not null references screens(id) on delete cascade,
  title              text not null default 'Now Showing',
  started_at         timestamptz not null default now(),
  ordering_closes_at timestamptz not null, -- started_at + ordering_window_minutes
  status             text not null default 'running' check (status in ('running','ended')),
  created_at         timestamptz not null default now()
);
create index idx_shows_screen_status on shows(screen_id, status);

-- ---------------------------------------------------------------------------
-- MENU
-- ---------------------------------------------------------------------------
create table menu_items (
  id           uuid primary key default gen_random_uuid(),
  theatre_id   uuid not null references theatres(id) on delete cascade,
  name         text not null,
  description  text,
  price        numeric(10,2) not null,   -- the ONE price — same online or in person
  image_url    text,
  is_available boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index idx_menu_theatre on menu_items(theatre_id);

-- ---------------------------------------------------------------------------
-- CUSTOMERS (audience) — google login + phone number captured once
-- ---------------------------------------------------------------------------
create table customers (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  name         text,
  phone        text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ORDERS
-- Money split (informational, for the theatre's own accounting):
--   subtotal          = sum(order_items.price_at_order * quantity)   — what the customer pays, matches walk-up counter price
--   platform_fee      = 0 for now (superadmin cut, configurable later)
--   gateway_fee is NOT added on top of the customer's total — the theatre
--   absorbs Razorpay's fee + GST out of the subtotal it receives. We simply
--   record razorpay's fee/tax from the payment webhook for the theatre's books.
-- ---------------------------------------------------------------------------
create table orders (
  id                  uuid primary key default gen_random_uuid(),
  theatre_id          uuid not null references theatres(id),
  show_id             uuid not null references shows(id),
  seat_id             uuid not null references seats(id),
  customer_id         uuid not null references customers(id),
  status              text not null default 'pending_payment'
                        check (status in ('pending_payment','paid','preparing','delivered','cancelled')),
  subtotal            numeric(10,2) not null,
  platform_fee        numeric(10,2) not null default 0,
  razorpay_order_id   text,
  razorpay_payment_id text,
  razorpay_fee        numeric(10,2),      -- filled in from webhook payload, informational
  razorpay_tax        numeric(10,2),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  delivered_at        timestamptz
);
create index idx_orders_theatre_status on orders(theatre_id, status);
create index idx_orders_show on orders(show_id);

create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  menu_item_id   uuid not null references menu_items(id),
  name_at_order  text not null,
  price_at_order numeric(10,2) not null,
  quantity       integer not null check (quantity > 0)
);
create index idx_order_items_order on order_items(order_id);

-- ============================================================================
-- SHEREBOY AFFILIATE CONCEPT — Supabase / PostgreSQL schema
--
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run) before starting the app
-- or running `npm run seed`.
--
-- Note: there is no "users" table here on purpose — admin accounts are
-- managed entirely by Supabase Auth (the built-in `auth.users` table).
-- ============================================================================

-- ---------- Categories ----------
create table if not exists public.categories (
  id           bigint generated always as identity primary key,
  name         text not null unique,
  slug         text not null unique,
  icon         text default '🛍️',
  description  text,
  created_at   timestamptz not null default now()
);

-- ---------- Products ----------
create table if not exists public.products (
  id                bigint generated always as identity primary key,
  name              text not null,
  slug              text not null unique,
  description       text,
  specifications    jsonb not null default '{}'::jsonb,
  price             numeric not null check (price >= 0),
  discount_percent  numeric not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  category_id       bigint references public.categories(id) on delete set null,
  affiliate_link    text not null,
  availability      text not null default 'in_stock' check (availability in ('in_stock', 'out_of_stock', 'limited')),
  is_featured       boolean not null default false,
  is_deal           boolean not null default false,
  images            jsonb not null default '[]'::jsonb,
  date_added        timestamptz not null default now()
);

create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_featured on public.products(is_featured);
create index if not exists idx_products_deal on public.products(is_deal);

-- ---------- Testimonials ----------
create table if not exists public.testimonials (
  id             bigint generated always as identity primary key,
  customer_name  text not null,
  quote          text not null,
  rating         integer not null default 5 check (rating between 1 and 5),
  created_at     timestamptz not null default now()
);

-- ---------- Newsletter subscribers ----------
create table if not exists public.subscribers (
  id          bigint generated always as identity primary key,
  email       text not null unique,
  created_at  timestamptz not null default now()
);

-- ---------- Contact form messages ----------
create table if not exists public.contact_messages (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text not null,
  subject     text,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
--
-- The Express backend is the ONLY thing that talks to Supabase, using the
-- SERVICE ROLE key (server-side only, never exposed to the browser). The
-- service role key bypasses RLS entirely, so the app keeps working normally.
--
-- We still enable RLS on every table with NO policies attached. This means
-- if the anon/public key were ever leaked or used directly, it would have
-- zero read/write access to these tables — a defense-in-depth safety net.
-- ============================================================================
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.testimonials enable row level security;
alter table public.subscribers enable row level security;
alter table public.contact_messages enable row level security;

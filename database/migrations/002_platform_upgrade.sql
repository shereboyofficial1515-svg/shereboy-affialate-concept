-- ============================================================================
-- Platform upgrade: newsletter + Resend email, verified/rating fields on
-- products, testimonial moderation and affiliate click counts.
--
-- Run once in Supabase (SQL Editor → New query → paste → Run) BEFORE deploying
-- the code that uses it. Safe to re-run.
--
-- ADDITIVE ONLY: no table or column is dropped and no product, subscriber or
-- message is deleted. The code currently running in production ignores every
-- new column, so running this first causes no downtime.
--
-- Two existing-data decisions, both reversible:
--  * Existing subscribers become status 'pending', not 'confirmed'. They signed
--    up before confirmation existed, so they get no marketing email until they
--    click a confirmation link (Admin → Subscribers → Send confirmation).
--  * The three sample testimonials inserted by database/seed.js are unpublished
--    because they are not from real customers. They stay in the table.
-- ============================================================================

-- ---------- Products ----------
alter table public.products add column if not exists is_verified boolean not null default false;
alter table public.products add column if not exists rating numeric(2,1);
alter table public.products add column if not exists rating_count integer;

do $$ begin
  alter table public.products add constraint products_rating_range check (rating is null or (rating >= 0 and rating <= 5));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_rating_count_positive check (rating_count is null or rating_count >= 0);
exception when duplicate_object then null; end $$;

create index if not exists idx_products_date_added on public.products(date_added desc);
create index if not exists idx_products_discount on public.products(discount_percent desc);

-- ---------- Testimonials ----------
alter table public.testimonials add column if not exists is_published boolean not null default true;

update public.testimonials set is_published = false
where (customer_name, quote) in (
  ('Amaka O.', 'Found a great headphone deal here that I couldn''t find anywhere else. Delivery was smooth too.'),
  ('Tunde A.', 'The product descriptions are honest and detailed — no surprises when the item arrived.'),
  ('Blessing E.', 'I use the AI assistant to compare products before buying. Saves me so much time.')
);

-- ---------- Subscribers ----------
alter table public.subscribers add column if not exists status text not null default 'pending';
-- Printed in the unsubscribe link of every email, so each subscriber needs one from the start
alter table public.subscribers add column if not exists unsubscribe_token text
  not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
alter table public.subscribers add column if not exists confirm_token_hash text;
alter table public.subscribers add column if not exists confirm_expires_at timestamptz;
alter table public.subscribers add column if not exists confirm_sent_at timestamptz;
alter table public.subscribers add column if not exists confirmed_at timestamptz;
alter table public.subscribers add column if not exists unsubscribed_at timestamptz;
alter table public.subscribers add column if not exists source text;
alter table public.subscribers add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.subscribers add constraint subscribers_status_valid
    check (status in ('pending', 'confirmed', 'unsubscribed', 'bounced', 'complained'));
exception when duplicate_object then null; end $$;

create unique index if not exists idx_subscribers_unsubscribe_token on public.subscribers(unsubscribe_token);
create index if not exists idx_subscribers_confirm_token on public.subscribers(confirm_token_hash);
create index if not exists idx_subscribers_status on public.subscribers(status);

-- The app stores addresses in lower case from now on. Rows that would collide
-- with an existing lower-case address are left untouched rather than merged.
update public.subscribers s set email = lower(s.email)
where s.email <> lower(s.email)
  and not exists (select 1 from public.subscribers o where o.email = lower(s.email));

-- ---------- Email campaigns ----------
create table if not exists public.email_campaigns (
  id               bigint generated always as identity primary key,
  kind             text not null default 'announcement' check (kind in ('announcement', 'weekly', 'update')),
  subject          text not null,
  preheader        text,
  heading          text not null,
  body             text not null default '',
  product_ids      jsonb not null default '[]'::jsonb,
  status           text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'partial', 'failed')),
  recipient_count  integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz
);

-- ---------- Email log: one row for every message we try to send ----------
create table if not exists public.email_logs (
  id             bigint generated always as identity primary key,
  kind           text not null check (kind in ('confirmation', 'welcome', 'campaign', 'test')),
  campaign_id    bigint references public.email_campaigns(id) on delete set null,
  subscriber_id  bigint references public.subscribers(id) on delete set null,
  email          text not null,
  subject        text,
  status         text not null default 'queued'
                 check (status in ('queued', 'sent', 'delivered', 'delivery_delayed', 'opened', 'clicked', 'bounced', 'complained', 'failed')),
  resend_id      text,
  error          text,
  attempts       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_email_logs_campaign on public.email_logs(campaign_id);
create index if not exists idx_email_logs_resend_id on public.email_logs(resend_id);
create index if not exists idx_email_logs_created on public.email_logs(created_at desc);
-- A campaign can never be logged (and so sent) twice to the same subscriber
create unique index if not exists idx_email_logs_campaign_recipient
  on public.email_logs(campaign_id, subscriber_id)
  where campaign_id is not null and subscriber_id is not null;

-- ---------- Affiliate click counts (powers "Trending"). Stores no visitor data. ----------
create table if not exists public.product_clicks (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists idx_product_clicks_recent on public.product_clicks(created_at desc);
create index if not exists idx_product_clicks_product on public.product_clicks(product_id);

-- ---------- Row Level Security: same policy as every other table ----------
-- RLS on with no policies: only the server-side service role can read or write.
alter table public.email_campaigns enable row level security;
alter table public.email_logs enable row level security;
alter table public.product_clicks enable row level security;

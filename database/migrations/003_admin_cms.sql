-- ============================================================================
-- Admin CMS: media library, site settings, pages, banners, roles, audit log,
-- AI control centre and the product publishing workflow.
--
-- Run once in Supabase (SQL Editor → New query → paste → Run) BEFORE deploying
-- the code that uses it. Safe to re-run.
--
-- ADDITIVE ONLY: nothing is dropped or deleted. Existing products become
-- status 'published', so the live catalogue doesn't change. The code currently
-- running in production ignores every new table and column.
-- ============================================================================

-- ---------- Product publishing workflow ----------
alter table public.products add column if not exists status text not null default 'published';
alter table public.products add column if not exists publish_at timestamptz;
alter table public.products add column if not exists short_description text;
alter table public.products add column if not exists seo_title text;
alter table public.products add column if not exists seo_description text;
-- 'text' keeps old descriptions displaying as they always have; the editor saves 'html'
alter table public.products add column if not exists description_format text not null default 'text';
-- Unpublished edits. The live columns aren't touched until "Publish".
alter table public.products add column if not exists draft jsonb;
alter table public.products add column if not exists draft_saved_at timestamptz;

do $$ begin
  alter table public.products add constraint products_status_valid
    check (status in ('draft', 'pending_review', 'published', 'scheduled', 'archived'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_description_format_valid
    check (description_format in ('text', 'html'));
exception when duplicate_object then null; end $$;

create index if not exists idx_products_status on public.products(status);

-- ---------- Categories can have a picture ----------
alter table public.categories add column if not exists image_url text;

-- ---------- Media library ----------
create table if not exists public.media_folders (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.media (
  id             bigint generated always as identity primary key,
  filename       text not null,
  kind           text not null check (kind in ('image', 'video', 'document')),
  mime_type      text not null,
  url            text not null unique,
  thumb_url      text,
  storage_paths  jsonb not null default '[]'::jsonb,
  size_bytes     bigint not null default 0,
  width          integer,
  height         integer,
  folder_id      bigint references public.media_folders(id) on delete set null,
  category       text,
  alt_text       text,
  title          text,
  description    text,
  uploaded_by    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_media_created on public.media(created_at desc);
create index if not exists idx_media_folder on public.media(folder_id);
create index if not exists idx_media_kind on public.media(kind);

-- ---------- Site settings: one JSON document per settings tab ----------
create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- ---------- Secrets entered in the dashboard, encrypted by the server ----------
create table if not exists public.secure_settings (
  key         text primary key,
  ciphertext  text not null,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- ---------- Legal and policy pages: draft, preview, publish ----------
create table if not exists public.pages (
  slug            text primary key,
  title           text not null,
  draft_html      text not null default '',
  published_html  text,
  published_at    timestamptz,
  updated_by      text,
  updated_at      timestamptz not null default now()
);

-- ---------- Banners ----------
create table if not exists public.banners (
  id          bigint generated always as identity primary key,
  title       text not null,
  message     text,
  image_url   text,
  link_url    text,
  placement   text not null default 'home_top' check (placement in ('home_top', 'home_middle', 'home_bottom')),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_banners_active on public.banners(is_active, placement);

-- ---------- Dashboard accounts beyond the owners named in ADMIN_EMAILS ----------
create table if not exists public.admin_roles (
  email       text primary key,
  role        text not null check (role in ('admin', 'editor')),
  created_by  text,
  created_at  timestamptz not null default now()
);

-- ---------- Audit log of sensitive changes ----------
create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  actor_email  text,
  action       text not null,
  target_type  text,
  target_id    text,
  details      jsonb,
  ip           text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_audit_created on public.admin_audit_log(created_at desc);

-- ---------- AI: instructions, knowledge base, usage ----------
create table if not exists public.ai_instructions (
  id          bigint generated always as identity primary key,
  title       text not null,
  body        text not null,
  category    text not null default 'general',
  is_enabled  boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.ai_knowledge (
  id               bigint generated always as identity primary key,
  title            text not null,
  category         text not null default 'general',
  body             text not null,
  source_filename  text,
  is_enabled       boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.ai_usage_logs (
  id             bigint generated always as identity primary key,
  feature        text not null,
  action         text,
  provider       text,
  model          text,
  status         text not null check (status in ('success', 'failed', 'blocked')),
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  estimated_cost numeric,
  duration_ms    integer,
  error          text,
  actor_email    text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_ai_usage_created on public.ai_usage_logs(created_at desc);

-- ---------- Row Level Security: only the server-side service role can read or write ----------
alter table public.media_folders enable row level security;
alter table public.media enable row level security;
alter table public.site_settings enable row level security;
alter table public.secure_settings enable row level security;
alter table public.pages enable row level security;
alter table public.banners enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.ai_instructions enable row level security;
alter table public.ai_knowledge enable row level security;
alter table public.ai_usage_logs enable row level security;

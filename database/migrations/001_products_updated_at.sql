-- ============================================================================
-- OPTIONAL — adds a "last updated" timestamp to products.
-- Run once in Supabase (SQL Editor → New query → paste → Run). Safe to re-run.
-- The public product API (/api/public/products) reports `updatedAt`; until
-- this runs it falls back to the date the product was added.
-- ============================================================================
alter table public.products add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_products_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_products_updated_at();

-- Baby Tracker: one-time Supabase setup (multi-tenant families).
-- Run this in Supabase Dashboard → SQL Editor on a fresh project.
--
-- Model: each family has a passphrase (stored as a sha256 hash). Every API
-- request carries the passphrase in the x-family-key header; row-level
-- security resolves it to one family and scopes all reads/writes to that
-- family's rows. Families are created from the app itself ("Create a new
-- family" in Settings) — no per-family SQL needed.

create extension if not exists pgcrypto with schema extensions;

create table public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  key_hash   text not null unique check (length(key_hash) = 64),
  created_at timestamptz not null default now()
);

create table public.events (
  id         text primary key,
  type       text not null check (type in ('sleep','feed','diaper')),
  started_at timestamptz not null,
  ended_at   timestamptz,
  details    jsonb not null default '{}'::jsonb,
  created_by text not null default '',
  family_id  uuid not null references public.families (id),
  updated_at timestamptz not null default now()
);
create index events_family_started_idx on public.events (family_id, started_at desc);

-- Resolve the x-family-key header to a family id. SECURITY DEFINER so it can
-- read families regardless of RLS; gated by the presented key itself.
create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.families
  where key_hash = encode(extensions.digest(
    coalesce(current_setting('request.headers', true)::json ->> 'x-family-key', ''),
    'sha256'), 'hex')
  limit 1;
$$;

-- Server stamps the family on insert; clients never send family_id.
create or replace function public.set_family_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.family_id := public.current_family_id();
  return new;
end;
$$;
create trigger events_set_family before insert on public.events
  for each row execute function public.set_family_id();

alter table public.events enable row level security;
create policy "own family select" on public.events for select
  using (family_id = (select public.current_family_id()));
create policy "own family insert" on public.events for insert
  with check (family_id = (select public.current_family_id()));
create policy "own family update" on public.events for update
  using (family_id = (select public.current_family_id()))
  with check (family_id = (select public.current_family_id()));
create policy "own family delete" on public.events for delete
  using (family_id = (select public.current_family_id()));

alter table public.families enable row level security;
create policy "own family row" on public.families for select
  using (id = (select public.current_family_id()));
create policy "create family" on public.families for insert
  with check (length(key_hash) = 64);
create policy "rename own family" on public.families for update
  using (id = (select public.current_family_id()))
  with check (id = (select public.current_family_id()));

-- New Supabase projects don't auto-expose tables to the Data API — explicit
-- grants required. RLS above still scopes every row to the caller's family.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.events to anon, authenticated;
grant select, insert, update on table public.families to anon, authenticated;

-- Trigger functions fire with the trigger owner's authority; callers never
-- need EXECUTE. (current_family_id keeps EXECUTE: RLS evaluates it as the
-- calling role, and via RPC it reveals only the caller's own family id.)
revoke execute on function public.set_family_id() from public, anon, authenticated;

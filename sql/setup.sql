-- Baby Tracker: one-time Supabase setup.
-- Run this in Supabase Dashboard → SQL Editor → New query → paste → Run.
--
-- BEFORE RUNNING: replace CHANGE_ME_FAMILY_PASSPHRASE below with your own
-- long passphrase (keep the quotes). Use the same value as `familyKey` in
-- js/config.js. To lock out a leaked key later, just re-run the
-- create-or-replace function with a new passphrase.

create table if not exists public.events (
  id         text primary key,
  type       text not null check (type in ('sleep','feed','diaper')),
  started_at timestamptz not null,
  ended_at   timestamptz,
  details    jsonb not null default '{}'::jsonb,
  created_by text not null default '',
  updated_at timestamptz not null default now()
);

-- Every request must present the family passphrase in the x-family-key
-- header; Postgres row-level security enforces it server-side.
create or replace function public.family_key_ok()
returns boolean
language sql
stable
as $$
  select coalesce(
    current_setting('request.headers', true)::json ->> 'x-family-key',
    ''
  ) = 'CHANGE_ME_FAMILY_PASSPHRASE';
$$;

alter table public.events enable row level security;

drop policy if exists "family select" on public.events;
drop policy if exists "family insert" on public.events;
drop policy if exists "family update" on public.events;
drop policy if exists "family delete" on public.events;

create policy "family select" on public.events
  for select using (public.family_key_ok());
create policy "family insert" on public.events
  for insert with check (public.family_key_ok());
create policy "family update" on public.events
  for update using (public.family_key_ok()) with check (public.family_key_ok());
create policy "family delete" on public.events
  for delete using (public.family_key_ok());

-- Since 2026-04-28, new Supabase projects no longer auto-expose new tables
-- to the Data API — these explicit grants are required. (Grants control
-- whether the API can reach the table at all; the RLS policies above still
-- gate every row on the family passphrase.)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.events to anon, authenticated;

create index if not exists events_started_at_idx on public.events (started_at desc);

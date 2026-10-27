-- ═══ Version 2.0, package C: Sync Grid builds ═══
-- A build is the list of grid tiles (their numbers in the datamine) a member switches on for one sync pair.
-- The rules of the grid live in the app (src/grid.js), because the grid data does not live in this database;
-- `grid_hash` fingerprints the grid the build was made on, so a later game update can be noticed.
create table if not exists public.grid_builds (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  pair_id     text not null,
  name        text not null check (length(trim(name)) > 0),
  purpose     text not null default '',
  nodes       int[] not null default '{}' check (cardinality(nodes) <= 400),
  move_level  smallint not null default 5 check (move_level between 1 and 10),
  energy_cap  smallint check (energy_cap is null or energy_cap between 0 and 999),
  visibility  text not null default 'private' check (visibility in ('private', 'gym')),
  grid_hash   text not null default '',
  data_version text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists grid_builds_pair on public.grid_builds (pair_id);
create index if not exists grid_builds_user on public.grid_builds (user_id);
alter table public.grid_builds enable row level security;
grant select, insert, update, delete on public.grid_builds to authenticated;
drop policy if exists "read: own or shared with the gym" on public.grid_builds;
drop policy if exists "write: own" on public.grid_builds;
create policy "read: own or shared with the gym" on public.grid_builds for select to authenticated
  using (user_id = auth.uid() or visibility = 'gym');
create policy "write: own" on public.grid_builds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function public.touch_grid_build() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists grid_builds_touch on public.grid_builds;
create trigger grid_builds_touch before update on public.grid_builds for each row execute function public.touch_grid_build();

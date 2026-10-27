-- ═══ Version 2.0, package B: Free Gems projection (events and the Free Gems they give) ═══
-- Only Free Gems. A reward is either every day of a range ('daily'), one named day ('on_date'), or a one-off
-- that can be claimed on any day of a range ('window'): a window is never given a made-up claim day.
-- Dates are "server days" (the day the game resets on), not the viewer's calendar day.
create table if not exists public.gem_settings (
  id             smallint primary key default 1 check (id = 1),
  reset_timezone text not null default 'UTC',
  reset_hour     smallint not null default 0 check (reset_hour between 0 and 23),
  updated_at     timestamptz not null default now()
);
insert into public.gem_settings (id) values (1) on conflict do nothing;
create table if not exists public.gem_events (
  id         bigint generated always as identity primary key,
  name       text not null check (length(trim(name)) > 0),
  start_date date not null,
  end_date   date not null,
  source     text not null default '',
  note       text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create table if not exists public.gem_rewards (
  id         bigint generated always as identity primary key,
  event_id   bigint references public.gem_events (id) on delete cascade,
  label      text not null check (length(trim(label)) > 0),
  kind       text not null check (kind in ('daily', 'on_date', 'window')),
  start_date date not null,
  end_date   date not null,
  free_gems  int check (free_gems is null or free_gems >= 0),     -- null = the amount is not known yet
  certainty  text not null default 'confirmed' check (certainty in ('confirmed', 'estimated')),
  condition  text not null default '',
  source     text not null default '',
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (kind <> 'on_date' or start_date = end_date)
);
create unique index if not exists gem_rewards_unique on public.gem_rewards (label, kind, start_date, end_date);
alter table public.gem_settings enable row level security;
alter table public.gem_events enable row level security;
alter table public.gem_rewards enable row level security;
grant select, insert, update, delete on public.gem_settings, public.gem_events, public.gem_rewards to authenticated;
do $$ declare t text; begin
  foreach t in array array['gem_settings', 'gem_events', 'gem_rewards'] loop
    execute format('drop policy if exists "read: signed in" on public.%I', t);
    execute format('drop policy if exists "write: staff" on public.%I', t);
    execute format('create policy "read: signed in" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "write: staff" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

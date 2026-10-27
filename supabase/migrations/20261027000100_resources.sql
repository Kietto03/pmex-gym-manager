-- ═══ Version 2.0, package A: Resources (a library of links: tier lists, trackers, guides) ═══
create table if not exists public.resource_links (
  id          bigint generated always as identity primary key,
  category    text not null check (category in ('tier_cn', 'tier_spark', 'tier_jp', 'tracker', 'guide', 'sheet', 'other')),
  title       text not null check (length(trim(title)) > 0),
  url         text not null check (url ~* '^https?://'),
  language    text not null default '',            -- 'en', 'vi', 'zh', 'ja'… free text
  scope       text not null default '',            -- the role / mode it is about, as the source names it
  source      text not null default '',
  author      text not null default '',
  version     text not null default '',
  effective   date,                                 -- when the content applies from
  checked_at  timestamptz,                          -- last time staff opened it and it worked
  status      text not null default 'unchecked' check (status in ('ok', 'broken', 'unchecked')),
  note        text not null default '',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists resource_links_url on public.resource_links (url);
alter table public.resource_links enable row level security;
grant select, insert, update, delete on public.resource_links to authenticated;
drop policy if exists "read: signed in" on public.resource_links;
drop policy if exists "write: staff" on public.resource_links;
create policy "read: signed in" on public.resource_links for select to authenticated using (true);
create policy "write: staff" on public.resource_links for all to authenticated using (public.is_staff()) with check (public.is_staff());
create or replace function public.touch_resource() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists resource_links_touch on public.resource_links;
create trigger resource_links_touch before update on public.resource_links for each row execute function public.touch_resource();

-- The starting set named in the v2.0 analysis (staff can edit or remove any of them)
insert into public.resource_links (category, title, url, language, scope, source) values
  ('tier_cn',    'Tier list (China) by role',      'https://docs.qq.com/sheet/DSWp2aXZHSUphT1lW?tab=n44aze', 'zh', 'by role', 'Tencent Docs'),
  ('tier_spark', 'Spark tier list',                'https://docs.google.com/document/u/0/d/1vF42uzF-xpkcfIU2gVEY4Dl7sS_I3ITj8g5X2lo1usA/mobilebasic', 'en', 'Spark', 'Google Docs'),
  ('tier_jp',    'Tier list (Japan)',              'https://gamewith.jp/pokemonmasters/article/show/164462', 'ja', 'all roles', 'GameWith'),
  ('sheet',      'HSE — high score grading',       'https://docs.google.com/spreadsheets/d/1B4sI4jcaSJzKBZ4kZlXSAU9VOLMG7BUxXnr5eW8crn0/edit?gid=223785772', 'en', 'high score grading (reference only)', 'Google Sheets'),
  ('sheet',      'D.C ranking',                    'https://docs.google.com/spreadsheets/d/14C_CPMRC8xHslf7id6wMqTdQeCvPA-_X4w9URrHNRzE/edit?gid=1658000195', 'en', 'D.C 3v1 / 3v3', 'Google Sheets'),
  ('sheet',      'GvG clear list',                 'https://docs.google.com/spreadsheets/d/1MxUU8SIMW7-EfehXIETsvXC5rlcRPinuHJkayrgr0xQ/edit?gid=617849742', 'en', 'GvG', 'Google Sheets'),
  ('sheet',      'Gems sheet',                     'https://docs.google.com/spreadsheets/d/1Vu8af6bU3hXuHCDZHr-ppVwkVjJfO2QZ3iSitcViYts/edit', 'en', 'Gems', 'Google Sheets'),
  ('tracker',    'PoMaTools — sync grid and damage', 'https://www.pomatools.site/#/', 'en', 'sync grid', 'PoMaTools'),
  ('tracker',    'Pasio Tower tracker',            'https://www.pomatowers.com/tracker', 'en', 'Pasio Tower', 'pomatowers.com'),
  ('tracker',    'Event programme',                'https://pokemon.brybry.ch/masters/programme.html', 'en', 'events', 'brybry.ch'),
  ('guide',      'Trainer Lodge topics',           'https://www.serebii.net/pokemonmasters/trainerlodgetopics.shtml', 'en', 'Trainer Lodge', 'Serebii')
on conflict (url) do nothing;

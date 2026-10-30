-- ═══════════════════════════════════════════════════════════════
--  Permission + rule tests for the Gym Manager schema.
--  Each check prints PASS/FAIL; the run fails if any FAIL appears.
-- ═══════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
set client_min_messages = warning;

create temp table results (n serial, name text, ok boolean, info text);
grant all on results to authenticated;
grant usage on sequence results_n_seq to authenticated;

-- Run `sql` as the given user; expect success (fragment null) or an error containing `fragment`
create function pg_temp.check(name text, uid uuid, sql text, fragment text default null) returns void
  language plpgsql as $$
declare err text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  if uid is not null then execute 'set local role authenticated'; end if;
  begin
    execute sql;
    execute 'reset role';
    insert into results (name, ok, info) values (name, fragment is null, case when fragment is null then 'ok' else 'expected error: ' || fragment end);
  exception when others then
    err := sqlerrm;
    execute 'reset role';
    insert into results (name, ok, info) values (name, fragment is not null and err ilike '%' || fragment || '%', err);
  end;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Row count visible to a user (0 = hidden by RLS)
create function pg_temp.visible(uid uuid, sql text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  execute sql into n;
  execute 'reset role';
  return n;
end $$;

-- ─── Fixtures (as the service/postgres role, like the Edge Function) ───
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'boss@x', '{"username":"boss","display_name":"Boss"}', '{"gym_role":"admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'mody@x', '{"username":"mody","display_name":"Mody"}', '{"gym_role":"mod"}'),
  ('00000000-0000-0000-0000-00000000000c', 'ann@x',  '{"username":"ann","display_name":"Ann"}',   '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'bob@x',  '{"username":"bob","display_name":"Bob"}',   '{}');

insert into public.pair_catalog (id, trainer, pokemon, type, role, ex_role, max_bonus) values
  ('p-sa', 'Cynthia', 'Garchomp', 'Dragon', 'Strike (Physical)', 'Tech', 10),
  ('p-5',  'Brock', 'Onix', 'Rock', 'Tech', '', 5),
  ('p-3',  'Misty', 'Staryu', 'Water', 'Tech', 'Strike', 5);
update public.pair_catalog set rarity = 3 where id = 'p-3';

-- Battle opened 3 days ago → 9 + 3×3 = 18 tickets granted so far
insert into public.seasons (name, battle_start, battle_end, leaders, circuits, is_active) values
  ('SS-test', now() - interval '3 days 1 hour', now() + interval '4 days',
   '[{"name":"Roark","type":"Rock"},{"name":"Gardenia","type":"Grass"}]',
   '[{"name":"Circuit 1","pts":10000,"kind":"Regular Battle"},{"name":"Circuit 2","pts":35000,"kind":"Regular Battle"},
     {"name":"Extra Battle 1 and onward","pts":100000,"kind":"Extra Battles"}]', true);

-- ─── Accounts & roles ───
select pg_temp.check('profile created from auth user with role',   null, $$ do $d$ begin
  assert (select role from public.profiles where username = 'boss') = 'admin';
  assert (select role from public.profiles where username = 'ann') = 'member'; end $d$ $$);
select pg_temp.check('role follows app_metadata written after the insert', null,
  $$ insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ('00000000-0000-0000-0000-00000000000e', 'late@x', '{"username":"late"}', '{}');
     update auth.users set raw_app_meta_data = '{"gym_role":"mod"}' where id = '00000000-0000-0000-0000-00000000000e';
     do $d$ begin assert (select role from public.profiles where username = 'late') = 'mod'; end $d$;
     delete from auth.users where id = '00000000-0000-0000-0000-00000000000e' $$);
select pg_temp.check('member edits own nickname',                   '00000000-0000-0000-0000-00000000000c',
  $$ update public.profiles set display_name = 'Ann!' where username = 'ann' $$);
select pg_temp.check('member sets their own profile photo',         '00000000-0000-0000-0000-00000000000c',
  $$ update public.profiles set avatar_url = 'https://x.test/a.webp' where username = 'ann';
     do $d$ begin assert (select avatar_url from public.profiles where username = 'ann') = 'https://x.test/a.webp'; end $d$ $$);
select pg_temp.check('member cannot promote self',                  '00000000-0000-0000-0000-00000000000c',
  $$ update public.profiles set role = 'admin' where username = 'ann' $$, 'Only the admin');
select pg_temp.check('mod cannot change roles',                     '00000000-0000-0000-0000-00000000000b',
  $$ update public.profiles set role = 'mod' where username = 'bob' $$, 'Only the admin');
select pg_temp.check('admin changes a role',                        '00000000-0000-0000-0000-00000000000a',
  $$ update public.profiles set role = 'member' where username = 'mody'; update public.profiles set role = 'mod' where username = 'mody' $$);
select pg_temp.check('member cannot edit another member',           '00000000-0000-0000-0000-00000000000c',
  $$ do $d$ declare n int; begin update public.profiles set note = 'x' where username = 'bob'; get diagnostics n = row_count; assert n = 0, 'updated'; end $d$ $$);
select pg_temp.check('mod edits another member',                    '00000000-0000-0000-0000-00000000000b',
  $$ do $d$ declare n int; begin update public.profiles set note = 'x' where username = 'bob'; get diagnostics n = row_count; assert n = 1; end $d$ $$);
select pg_temp.check('member cannot delete accounts',               '00000000-0000-0000-0000-00000000000c',
  $$ do $d$ declare n int; begin delete from public.profiles where username = 'bob'; get diagnostics n = row_count; assert n = 0, 'deleted'; end $d$ $$);

-- ─── Pairs & tower ───
select pg_temp.check('member adds own pair',                        '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.member_pairs (user_id, pair_id, level, ex, ex_role) values ('00000000-0000-0000-0000-00000000000c', 'p-sa', 10, true, true) $$);
select pg_temp.check('level > 5 on a 5/5 pair is rejected',         '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.member_pairs (user_id, pair_id, level) values ('00000000-0000-0000-0000-00000000000c', 'p-5', 6) $$, 'only goes up to 5/5');
select pg_temp.check('EX Role on a pair without one is rejected',   '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.member_pairs (user_id, pair_id, ex_role) values ('00000000-0000-0000-0000-00000000000c', 'p-5', true) $$, 'has no EX Role');
select pg_temp.check('unknown pair is rejected',                    '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.member_pairs (user_id, pair_id) values ('00000000-0000-0000-0000-00000000000c', 'nope') $$, 'foreign key');
select pg_temp.check('member cannot add pairs for someone else',    '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.member_pairs (user_id, pair_id) values ('00000000-0000-0000-0000-00000000000d', 'p-5') $$, 'row-level security');
select pg_temp.check('mod fills in pairs for a member',             '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.member_pairs (user_id, pair_id, level) values ('00000000-0000-0000-0000-00000000000d', 'p-5', 5) $$);
select pg_temp.check('3★ pair starts at its base stars',           '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.member_pairs (user_id, pair_id) values ('00000000-0000-0000-0000-00000000000c', 'p-3');
     do $d$ begin assert (select stars from public.member_pairs where pair_id = 'p-3') = 3; end $d$ $$);
select pg_temp.check('6★ EX before 5★ is rejected',                 '00000000-0000-0000-0000-00000000000c',
  $$ update public.member_pairs set ex = true where pair_id = 'p-3' $$, 'to 5★ before 6★ EX');
select pg_temp.check('stars below the base rarity are rejected',    '00000000-0000-0000-0000-00000000000c',
  $$ update public.member_pairs set stars = 2 where pair_id = 'p-3' $$, 'starts at 3★');
select pg_temp.check('EX Role is independent of 6★ EX',             '00000000-0000-0000-0000-00000000000c',
  $$ update public.member_pairs set stars = 5, ex_role = true where pair_id = 'p-3';
     do $d$ begin assert (select ex_role and not ex from public.member_pairs where pair_id = 'p-3'); end $d$ $$);
select pg_temp.check('raise to 5★, then EX and EX Role',            '00000000-0000-0000-0000-00000000000c',
  $$ update public.member_pairs set stars = 5 where pair_id = 'p-3';
     update public.member_pairs set ex = true, ex_role = true where pair_id = 'p-3' $$);
select pg_temp.check('mod updates a member''s pair level',          '00000000-0000-0000-0000-00000000000b',
  $$ do $d$ declare n int; begin update public.member_pairs set level = 4, ex = true where user_id = '00000000-0000-0000-0000-00000000000d' and pair_id = 'p-5'; get diagnostics n = row_count; assert n = 1; end $d$ $$);
select pg_temp.check('tower floor saved',                           '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.tower_progress (user_id, type, floor) values ('00000000-0000-0000-0000-00000000000c', 'Dragon', 40) $$);
select pg_temp.check('tower floor above 40 is rejected',            '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.tower_progress (user_id, type, floor) values ('00000000-0000-0000-0000-00000000000c', 'Rock', 41) $$, 'check constraint');
select pg_temp.check('unknown tower type is rejected',              '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.tower_progress (user_id, type, floor) values ('00000000-0000-0000-0000-00000000000c', 'Sound', 1) $$, 'check constraint');

-- ─── Seasons (staff only) ───
select pg_temp.check('member cannot create a season',               '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.seasons (name, battle_start, battle_end, leaders, circuits) values ('x', now(), now() + interval '1 day', '[]', '[]') $$, 'row-level security');
select pg_temp.check('mod bans a member for the season',            '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.season_members (season_id, user_id, banned) select id, '00000000-0000-0000-0000-00000000000d', true from public.seasons $$);

-- ─── Assignments: staff pick the team from the member's own roster ───
select pg_temp.check('mod assigns a team from the roster',          '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.assignments (season_id, leader, user_id, team) select id, 'Roark', '00000000-0000-0000-0000-00000000000c', '{p-sa}' from public.seasons $$);
select pg_temp.check('team with a pair they don''t own is rejected', '00000000-0000-0000-0000-00000000000b',
  $$ update public.assignments set team = '{p-sa,p-5}' where user_id = '00000000-0000-0000-0000-00000000000c' $$, 'Brock & Onix is not in this member''s roster');
select pg_temp.check('same pair twice is rejected',                 '00000000-0000-0000-0000-00000000000b',
  $$ update public.assignments set team = '{p-sa,p-sa}' where user_id = '00000000-0000-0000-0000-00000000000c' $$, 'twice');
select pg_temp.check('member cannot change assignments',            '00000000-0000-0000-0000-00000000000c',
  $$ do $d$ declare n int; begin update public.assignments set team = '{}' where user_id = '00000000-0000-0000-0000-00000000000c'; get diagnostics n = row_count; assert n = 0, 'updated'; end $d$ $$);
select pg_temp.check('pair removed from roster leaves the team',    '00000000-0000-0000-0000-00000000000c',
  $$ delete from public.member_pairs where user_id = '00000000-0000-0000-0000-00000000000c' and pair_id = 'p-sa';
     insert into public.member_pairs (user_id, pair_id, level, ex, ex_role) values ('00000000-0000-0000-0000-00000000000c', 'p-sa', 10, true, true);
     do $d$ begin assert (select team from public.assignments where user_id = '00000000-0000-0000-0000-00000000000c') = '{}'::text[];
                  end $d$ $$);

-- ─── Roster sheet: members fill their own row, staff fill anyone's ───
select pg_temp.check('member fills their own sheet cell',           '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.roster_sheet (user_id, type, slot, pair_id) values ('00000000-0000-0000-0000-00000000000c', 'Dragon', 'physical', 'p-sa') $$);
select pg_temp.check('member marks a slot as none',                 '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.roster_sheet (user_id, type, slot, pair_id) values ('00000000-0000-0000-0000-00000000000c', 'Dragon', 'special', null) $$);
select pg_temp.check('sheet cell with an unowned pair is rejected', '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.roster_sheet (user_id, type, slot, pair_id) values ('00000000-0000-0000-0000-00000000000c', 'Rock', 'support', 'p-5') $$, 'not in this member''s roster');
select pg_temp.check('member cannot fill someone else''s row',      '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.roster_sheet (user_id, type, slot, pair_id) values ('00000000-0000-0000-0000-00000000000d', 'Rock', 'support', 'p-5') $$, 'row-level security');
select pg_temp.check('mod fills a member''s sheet cell',            '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.roster_sheet (user_id, type, slot, pair_id) values ('00000000-0000-0000-0000-00000000000d', 'Rock', 'support', 'p-5') $$);
select pg_temp.check('unknown slot is rejected',                    '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.roster_sheet (user_id, type, slot) values ('00000000-0000-0000-0000-00000000000d', 'Rock', 'captain') $$, 'check constraint');
select pg_temp.check('pair removed from roster clears its sheet cells', '00000000-0000-0000-0000-00000000000c',
  $$ delete from public.member_pairs where user_id = '00000000-0000-0000-0000-00000000000c' and pair_id = 'p-sa';
     do $d$ begin assert not exists (select 1 from public.roster_sheet where pair_id = 'p-sa'); end $d$;
     insert into public.member_pairs (user_id, pair_id, level, ex, ex_role) values ('00000000-0000-0000-0000-00000000000c', 'p-sa', 10, true, true) $$);

-- ─── Strategy text + facilitator plans (staff) ───
select pg_temp.check('mod writes the season strategy',              '00000000-0000-0000-0000-00000000000b',
  $$ update public.seasons set strategy = E'# Rules\n- be on time' $$);
select pg_temp.check('member cannot edit the strategy',             '00000000-0000-0000-0000-00000000000c',
  $$ do $d$ declare n int; begin update public.seasons set strategy = 'x'; get diagnostics n = row_count; assert n = 0, 'updated'; end $d$ $$);
select pg_temp.check('mod plans a facilitator from their roster',   '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.facilitator_plans (season_id, leader, user_id, team, does) select id, 'Roark', '00000000-0000-0000-0000-00000000000d', '{p-5}', '{rebuff,status}' from public.seasons $$);
select pg_temp.check('facilitator team with an unowned pair is rejected', '00000000-0000-0000-0000-00000000000b',
  $$ update public.facilitator_plans set team = '{p-sa}' where user_id = '00000000-0000-0000-0000-00000000000d' $$, 'not in this member''s roster');
select pg_temp.check('unknown facilitator duty is rejected',        '00000000-0000-0000-0000-00000000000b',
  $$ update public.facilitator_plans set does = '{dance}' where user_id = '00000000-0000-0000-0000-00000000000d' $$, 'check constraint');
select pg_temp.check('member cannot plan facilitators',             '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.facilitator_plans (season_id, leader, user_id) select id, 'Roark', '00000000-0000-0000-0000-00000000000c' from public.seasons $$, 'row-level security');
select pg_temp.check('pair leaving the roster leaves the facilitator team', '00000000-0000-0000-0000-00000000000b',
  $$ delete from public.member_pairs where user_id = '00000000-0000-0000-0000-00000000000d' and pair_id = 'p-5';
     do $d$ begin assert (select team from public.facilitator_plans where user_id = '00000000-0000-0000-0000-00000000000d') = '{}'::text[]; end $d$ $$);

-- ─── Runs: the Gym Battle rules ───
select pg_temp.check('member logs a run in the open round',         '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score) select id, '00000000-0000-0000-0000-00000000000c', 'Roark', 1, 3, 10000 from public.seasons $$);
select pg_temp.check('member_name snapshot filled in',              null,
  $$ do $d$ begin assert (select member_name from public.runs limit 1) = 'Ann!'; end $d$ $$);
select pg_temp.check('regular circuit must cost 3 tickets',         '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score) select id, '00000000-0000-0000-0000-00000000000c', 'Gardenia', 1, 1, 5000 from public.seasons $$, 'always costs 3 tickets');
select pg_temp.check('score above the round cap is rejected',       '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score) select id, '00000000-0000-0000-0000-00000000000c', 'Gardenia', 1, 3, 10001 from public.seasons $$, 'Over the cap');
select pg_temp.check('member cannot log a closed/unopened round',   '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score) select id, '00000000-0000-0000-0000-00000000000c', 'Roark', 2, 3, 100 from public.seasons $$, 'open round');
select pg_temp.check('member cannot log for someone else',          '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score) select id, '00000000-0000-0000-0000-00000000000b', 'Gardenia', 1, 3, 100 from public.seasons $$, 'row-level security');
select pg_temp.check('banned member cannot get new runs',           '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score) select id, '00000000-0000-0000-0000-00000000000d', 'Gardenia', 1, 3, 100 from public.seasons $$, 'locked for the season');
select pg_temp.check('clearing every leader opens round 2',         '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score) select id, '00000000-0000-0000-0000-00000000000b', 'Gardenia', 1, 3, 10000 from public.seasons;
     do $d$ begin assert public.season_active_round((select id from public.seasons)) = 2; end $d$ $$);
select pg_temp.check('ticket budget: 18 granted after 3 days',      null,
  $$ do $d$ begin assert public.season_tickets_granted((select s from public.seasons s)) = 18; end $d$ $$);
select pg_temp.check('the final day (and after) grants the full 30 tickets', null,
  $$ do $d$ declare s public.seasons := (select s from public.seasons s);
     begin assert public.season_tickets_granted(s, s.battle_end) = 30; assert public.season_tickets_granted(s, s.battle_end - interval '2 days') < 30; end $d$ $$);
select pg_temp.check('running out of tickets is rejected',          '00000000-0000-0000-0000-00000000000c',
  $$ do $d$ declare sid bigint := (select id from public.seasons); begin
       for i in 1..6 loop insert into public.runs (season_id, user_id, leader, round, tickets, score) values (sid, '00000000-0000-0000-0000-00000000000c', 'Roark', 2, 3, 100); end loop; end $d$ $$, 'Not enough tickets');
select pg_temp.check('extra battle allows 1–3 tickets, repeats',    '00000000-0000-0000-0000-00000000000a',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score) select id, '00000000-0000-0000-0000-00000000000a', 'Roark', 7, 1, 5000 from public.seasons $$);
select pg_temp.check('member cannot delete someone else''s run',    '00000000-0000-0000-0000-00000000000c',
  $$ do $d$ declare n int; begin delete from public.runs where user_id = '00000000-0000-0000-0000-00000000000b'; get diagnostics n = row_count; assert n = 0, 'deleted'; end $d$ $$);
select pg_temp.check('member edits own run',                        '00000000-0000-0000-0000-00000000000c',
  $$ do $d$ declare n int; begin update public.runs set note = 'gg' where user_id = '00000000-0000-0000-0000-00000000000c'; get diagnostics n = row_count; assert n >= 1; end $d$ $$);
select pg_temp.check('history run of a departed member can be stored', '00000000-0000-0000-0000-00000000000a',
  $$ insert into public.runs (season_id, user_id, member_name, leader, round, tickets, score, team, excluded)
     select id, null, 'adeo', 'Gardenia', 2, 3, 100, '[]', true from public.seasons;
     do $d$ begin assert (select excluded from public.runs where member_name = 'adeo') and (select team from public.runs where member_name = 'adeo') = '[]'::jsonb; end $d$ $$);
select pg_temp.check('activity log hidden from members',            null,
  $$ do $d$ begin assert pg_temp.visible('00000000-0000-0000-0000-00000000000c', 'select count(*) from public.activity') = 0;
                  assert pg_temp.visible('00000000-0000-0000-0000-00000000000b', 'select count(*) from public.activity') > 0; end $d$ $$);

-- ─── A member leaves: account deleted, their runs keep the name ───
select pg_temp.check('deleting an account keeps its runs',          null,
  $$ delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
     do $d$ begin
       assert not exists (select 1 from public.profiles where username = 'ann');
       assert not exists (select 1 from public.member_pairs where user_id = '00000000-0000-0000-0000-00000000000c');
       assert exists (select 1 from public.runs where user_id is null and member_name = 'Ann!'); end $d$ $$);

-- ─── Report ───
-- ─── A Gym Battle that is over is frozen: only the admin changes it ───
insert into public.seasons (name, battle_start, battle_end, leaders, circuits) values
  ('SS-over', now() - interval '20 days', now() - interval '10 days',
   '[{"name":"Roark","type":"Rock"}]', '[{"name":"Circuit 1","pts":10000,"kind":"Regular Battle"}]');
select pg_temp.check('mod cannot log into an ended season',           '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.runs (season_id, user_id, member_name, leader, round, tickets, score) select id, null, 'x', 'Roark', 1, 3, 100 from public.seasons where name = 'SS-over' $$, 'over');
select pg_temp.check('member cannot log into an ended season',        '00000000-0000-0000-0000-00000000000c',
  $$ insert into public.runs (season_id, user_id, member_name, leader, round, tickets, score) select id, null, 'x', 'Roark', 1, 3, 100 from public.seasons where name = 'SS-over' $$, 'over');
select pg_temp.check('admin can still log into an ended season',      '00000000-0000-0000-0000-00000000000a',
  $$ insert into public.runs (season_id, user_id, member_name, leader, round, tickets, score) select id, null, 'x', 'Roark', 1, 3, 100 from public.seasons where name = 'SS-over' $$);
select pg_temp.check('mod cannot delete a run of an ended season',    '00000000-0000-0000-0000-00000000000b',
  $$ delete from public.runs where member_name = 'x' $$, 'over');
select pg_temp.check('mod cannot plan an ended season',               '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.leader_notes (season_id, leader, note) select id, 'Roark', 'late' from public.seasons where name = 'SS-over' $$, 'over');

-- ─── Version 2.0 (package A): timezone, battle role + main type, battle time ───
select pg_temp.check('member sets a valid timezone',                '00000000-0000-0000-0000-00000000000d',
  $$ update public.profiles set timezone = 'Asia/Ho_Chi_Minh' where id = '00000000-0000-0000-0000-00000000000d' $$);
select pg_temp.check('an unknown timezone is rejected',             '00000000-0000-0000-0000-00000000000d',
  $$ update public.profiles set timezone = 'Mars/Base' where id = '00000000-0000-0000-0000-00000000000d' $$, 'not a valid timezone');
select pg_temp.check('member cannot assign a battle role',          '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.season_members (season_id, user_id, battle_role) select id, '00000000-0000-0000-0000-00000000000d', 'DDs' from public.seasons where name = 'SS-test' $$, 'row-level security');
select pg_temp.check('mod assigns role and main type',              '00000000-0000-0000-0000-00000000000b',
  $$ update public.season_members set battle_role = 'DDs', main_type = 'Fire', banned = false where user_id = '00000000-0000-0000-0000-00000000000d' $$);
select pg_temp.check('mod sets a reinforcement type',               '00000000-0000-0000-0000-00000000000b',
  $$ update public.season_members set support_type = 'Grass' where user_id = '00000000-0000-0000-0000-00000000000d' $$);
select pg_temp.check('the reinforcement type cannot equal the main type', '00000000-0000-0000-0000-00000000000b',
  $$ update public.season_members set support_type = 'Fire' where user_id = '00000000-0000-0000-0000-00000000000d' $$, 'season_members_support_differs');
select pg_temp.check('an unknown battle role is rejected',          '00000000-0000-0000-0000-00000000000b',
  $$ update public.season_members set battle_role = 'Boss' where user_id = '00000000-0000-0000-0000-00000000000d' $$, 'check');
select pg_temp.check('member logs a run with its battle time',      '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score, occurred_at) select id, '00000000-0000-0000-0000-00000000000d', 'Gardenia', 2, 3, 100, now() - interval '2 hours' from public.seasons where name = 'SS-test' $$);
select pg_temp.check('battle time before the Gym Battle is rejected', '00000000-0000-0000-0000-00000000000d',
  $$ update public.runs set occurred_at = now() - interval '9 days' where user_id = '00000000-0000-0000-0000-00000000000d' and leader = 'Gardenia' $$, 'battle time');
select pg_temp.check('battle time in the future is rejected',       '00000000-0000-0000-0000-00000000000d',
  $$ update public.runs set occurred_at = now() + interval '1 day' where user_id = '00000000-0000-0000-0000-00000000000d' and leader = 'Gardenia' $$, 'battle time');
select pg_temp.check('member moves the time of their own run',      '00000000-0000-0000-0000-00000000000d',
  $$ update public.runs set occurred_at = now() - interval '1 hour' where user_id = '00000000-0000-0000-0000-00000000000d' and leader = 'Gardenia';
     do $d$ begin if (select count(*) from public.run_time_edits) <> 1 or (select occurred_inferred from public.runs where leader = 'Gardenia' and user_id = '00000000-0000-0000-0000-00000000000d') then raise exception 'time edit not audited'; end if; end $d$ $$);
select pg_temp.check('mod cannot change the time after the season', '00000000-0000-0000-0000-00000000000b',
  $$ update public.runs set occurred_at = now() - interval '15 days' where member_name = 'x' $$, 'over');
select pg_temp.check('admin changes the time after the season',     '00000000-0000-0000-0000-00000000000a',
  $$ update public.runs set occurred_at = now() - interval '15 days' where member_name = 'x' $$);
select pg_temp.check('the round and tickets stay when the time moves', '00000000-0000-0000-0000-00000000000a',
  $$ do $d$ begin if not ((select round from public.runs where member_name = 'x') = 1 and (select tickets from public.runs where member_name = 'x') = 3) then raise exception 'round or tickets changed'; end if; end $d$ $$);

-- ─── Tower progress: everyone reads, only the owner or staff edit ───
insert into public.tower_progress (user_id, type, floor) values ('00000000-0000-0000-0000-00000000000d', 'Fire', 12), ('00000000-0000-0000-0000-00000000000a', 'Fire', 30) on conflict do nothing;
select pg_temp.check('member sees everyone''s tower',                '00000000-0000-0000-0000-00000000000d',
  $$ do $d$ begin if (select count(distinct user_id) from public.tower_progress) < 2 then raise exception 'cannot see others'; end if; end $d$ $$);
select pg_temp.check('member cannot edit someone else''s tower',      '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.tower_progress (user_id, type, floor) values ('00000000-0000-0000-0000-00000000000a', 'Water', 5) $$, 'row-level security');

-- ─── Resources: everyone reads, staff write ───
select pg_temp.check('member reads the resource list',            '00000000-0000-0000-0000-00000000000d', $$ do $d$ begin if (select count(*) from public.resource_links) < 5 then raise exception 'no resources'; end if; end $d$ $$);
select pg_temp.check('member cannot add a resource',               '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.resource_links (category, title, url) values ('other', 'x', 'https://example.com/m') $$, 'row-level security');
select pg_temp.check('staff adds a resource',                      '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.resource_links (category, title, url) values ('guide', 'Guide', 'https://example.com/g') $$);
select pg_temp.check('a link must be http(s)',                     '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.resource_links (category, title, url) values ('guide', 'Bad', 'javascript:alert(1)') $$, 'check');
select pg_temp.check('the same link cannot be added twice',        '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.resource_links (category, title, url) values ('guide', 'Dup', 'https://example.com/g') $$, 'duplicate');

-- ─── Strategy library: draft → review → published, revisions keep the published one until approved ───
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ('00000000-0000-0000-0000-00000000000f', 'fay@x', '{"username":"fay"}', '{}');
select pg_temp.check('member writes a strategy draft',            '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.strategies (mode, created_by) values ('GvG', '00000000-0000-0000-0000-00000000000d');
     insert into public.strategy_revisions (strategy_id, title, weakness, team) select id, 'Fire rush', 'Fire', '[{"pair_id":"p-sa"}]' from public.strategies where created_by = '00000000-0000-0000-0000-00000000000d' $$);
select pg_temp.check('other members do not see the draft',        '00000000-0000-0000-0000-00000000000f',
  $$ do $d$ begin if (select count(*) from public.strategy_revisions) <> 0 then raise exception 'draft leaked'; end if; end $d$ $$);
select pg_temp.check('staff sees the draft',                      '00000000-0000-0000-0000-00000000000b',
  $$ do $d$ begin if (select count(*) from public.strategy_revisions) <> 1 then raise exception 'staff cannot see it'; end if; end $d$ $$);
select pg_temp.check('a member cannot publish their own strategy', '00000000-0000-0000-0000-00000000000d',
  $$ update public.strategy_revisions set status = 'published' where title = 'Fire rush' $$, 'cannot become');
select pg_temp.check('author submits for review',                 '00000000-0000-0000-0000-00000000000d',
  $$ update public.strategy_revisions set status = 'pending' where title = 'Fire rush' $$);
select pg_temp.check('the author cannot edit while it is in review', '00000000-0000-0000-0000-00000000000d',
  $$ update public.strategy_revisions set title = 'Sneaky' where title = 'Fire rush' $$, 'Only the author can edit');
select pg_temp.check('a member cannot approve (it is not even visible)', '00000000-0000-0000-0000-00000000000f',
  $$ update public.strategy_revisions set status = 'published' where title = 'Fire rush';
     do $d$ begin if (select count(*) from public.strategy_revisions) <> 0 then raise exception 'visible'; end if; end $d$ $$);
select pg_temp.check('changes need a note',                       '00000000-0000-0000-0000-00000000000b',
  $$ update public.strategy_revisions set status = 'changes_requested' where title = 'Fire rush' $$, 'what needs to change');
select pg_temp.check('mod asks for changes with a note',          '00000000-0000-0000-0000-00000000000b',
  $$ update public.strategy_revisions set status = 'changes_requested', review_note = 'Add the rotation' where title = 'Fire rush' $$);
select pg_temp.check('author fixes and resubmits',                '00000000-0000-0000-0000-00000000000d',
  $$ update public.strategy_revisions set rotation = 'Turn 1: sync', status = 'pending' where title = 'Fire rush' $$);
select pg_temp.check('mod publishes',                             '00000000-0000-0000-0000-00000000000b',
  $$ update public.strategy_revisions set status = 'published' where title = 'Fire rush';
     do $d$ begin if (select published_rev from public.strategies where created_by = '00000000-0000-0000-0000-00000000000d') is null then raise exception 'not linked'; end if; end $d$ $$);
select pg_temp.check('everyone now sees the published strategy',  '00000000-0000-0000-0000-00000000000f',
  $$ do $d$ begin if (select count(*) from public.strategy_revisions where status = 'published') <> 1 then raise exception 'not visible'; end if; end $d$ $$);
select pg_temp.check('a published revision cannot be edited',     '00000000-0000-0000-0000-00000000000d',
  $$ update public.strategy_revisions set title = 'Changed' where title = 'Fire rush' $$, 'never changes');
select pg_temp.check('a member proposes a new revision',          '00000000-0000-0000-0000-00000000000f',
  $$ insert into public.strategy_revisions (strategy_id, title, rotation, status) select id, 'Fire rush v2', 'Faster', 'pending' from public.strategies where created_by = '00000000-0000-0000-0000-00000000000d' $$);
select pg_temp.check('only one open revision at a time',          '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.strategy_revisions (strategy_id, title) select id, 'Another' from public.strategies where created_by = '00000000-0000-0000-0000-00000000000d' $$, 'already has a revision');
select pg_temp.check('the published revision stays until approval', '00000000-0000-0000-0000-00000000000f',
  $$ do $d$ begin if (select title from public.strategy_revisions r join public.strategies s on s.published_rev = r.id) <> 'Fire rush' then raise exception 'replaced early'; end if; end $d$ $$);
select pg_temp.check('approving the revision supersedes the old one', '00000000-0000-0000-0000-00000000000b',
  $$ update public.strategy_revisions set status = 'published' where title = 'Fire rush v2';
     do $d$ begin if (select count(*) from public.strategy_revisions where status = 'superseded' and title = 'Fire rush') <> 1 or (select rev_no from public.strategy_revisions r join public.strategies s on s.published_rev = r.id) <> 2 then raise exception 'not superseded'; end if; end $d$ $$);

-- ─── Sync Grid builds: private by default, shareable with the gym, only the owner edits ───
select pg_temp.check('member saves a private build',               '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.grid_builds (user_id, pair_id, name, nodes) values ('00000000-0000-0000-0000-00000000000d', '0-red-1996-pikachu', 'Speed build', '{1,2,3}') $$);
select pg_temp.check('other members cannot see a private build',   '00000000-0000-0000-0000-00000000000f',
  $$ do $d$ begin if (select count(*) from public.grid_builds) <> 0 then raise exception 'leaked'; end if; end $d$ $$);
select pg_temp.check('a mod cannot read a private build either',   '00000000-0000-0000-0000-00000000000b',
  $$ do $d$ begin if (select count(*) from public.grid_builds) <> 0 then raise exception 'staff saw it'; end if; end $d$ $$);
select pg_temp.check('owner shares it with the gym',               '00000000-0000-0000-0000-00000000000d',
  $$ update public.grid_builds set visibility = 'gym' where name = 'Speed build' $$);
select pg_temp.check('everyone now sees the shared build',         '00000000-0000-0000-0000-00000000000f',
  $$ do $d$ begin if (select count(*) from public.grid_builds) <> 1 then raise exception 'not shared'; end if; end $d$ $$);
select pg_temp.check('nobody else can edit it',                    '00000000-0000-0000-0000-00000000000f',
  $$ update public.grid_builds set name = 'Hacked' where name = 'Speed build';
     do $d$ begin if (select count(*) from public.grid_builds where name = 'Hacked') <> 0 then raise exception 'edited'; end if; end $d$ $$);
select pg_temp.check('nobody else can delete it',                  '00000000-0000-0000-0000-00000000000b',
  $$ delete from public.grid_builds where name = 'Speed build';
     do $d$ begin if (select count(*) from public.grid_builds) <> 1 then raise exception 'deleted'; end if; end $d$ $$);
select pg_temp.check('a build cannot be saved for someone else',   '00000000-0000-0000-0000-00000000000f',
  $$ insert into public.grid_builds (user_id, pair_id, name) values ('00000000-0000-0000-0000-00000000000d', 'x', 'Forged') $$, 'row-level security');
select pg_temp.check('a build needs a name',                       '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.grid_builds (user_id, pair_id, name) values ('00000000-0000-0000-0000-00000000000d', 'x', '  ') $$, 'check');

-- ─── Free Gems: everyone reads, staff write, no duplicates ───
select pg_temp.check('staff adds a daily reward',                  '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.gem_rewards (label, kind, start_date, end_date, free_gems) values ('Daily login', 'daily', '2026-10-01', '2026-10-31', 10) $$);
select pg_temp.check('member reads the rewards',                   '00000000-0000-0000-0000-00000000000d', $$ do $d$ begin if (select count(*) from public.gem_rewards) <> 1 then raise exception 'cannot read'; end if; end $d$ $$);
select pg_temp.check('member cannot add a reward',                 '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.gem_rewards (label, kind, start_date, end_date, free_gems) values ('Mine', 'on_date', '2026-10-05', '2026-10-05', 99999) $$, 'row-level security');
select pg_temp.check('the same reward cannot be entered twice',    '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.gem_rewards (label, kind, start_date, end_date, free_gems) values ('Daily login', 'daily', '2026-10-01', '2026-10-31', 10) $$, 'duplicate');
select pg_temp.check('a one-day reward needs one date',            '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.gem_rewards (label, kind, start_date, end_date, free_gems) values ('Bad', 'on_date', '2026-10-05', '2026-10-06', 5) $$, 'check');
select pg_temp.check('negative gems are refused',                  '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.gem_rewards (label, kind, start_date, end_date, free_gems) values ('Neg', 'on_date', '2026-10-05', '2026-10-05', -5) $$, 'check');
select pg_temp.check('an unknown amount is allowed',               '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.gem_rewards (label, kind, start_date, end_date, free_gems) values ('Unknown', 'window', '2026-10-05', '2026-10-12', null) $$);
select pg_temp.check('a member cannot change the reset settings',  '00000000-0000-0000-0000-00000000000d',
  $$ update public.gem_settings set reset_hour = 5 $$);

-- ─── Support runs: the main type is kept on the run, reviews never touch points ───
select pg_temp.check('a new run keeps the main type of the moment',  '00000000-0000-0000-0000-00000000000d',
  $$ insert into public.runs (season_id, user_id, leader, round, tickets, score, occurred_at) select id, '00000000-0000-0000-0000-00000000000d', 'Roark', 2, 3, 50, now() - interval '30 minutes' from public.seasons where name = 'SS-test';
     do $d$ begin if (select main_type_at from public.runs where leader = 'Roark' and round = 2 and user_id = '00000000-0000-0000-0000-00000000000d') is distinct from 'Fire' then raise exception 'no snapshot'; end if; end $d$ $$);
select pg_temp.check('changing the assignment later keeps old runs', '00000000-0000-0000-0000-00000000000b',
  $$ update public.season_members set main_type = 'Water' where user_id = '00000000-0000-0000-0000-00000000000d';
     do $d$ begin if (select main_type_at from public.runs where leader = 'Roark' and round = 2 and user_id = '00000000-0000-0000-0000-00000000000d') is distinct from 'Fire' then raise exception 'history rewritten'; end if; end $d$ $$);
select pg_temp.check('staff confirms a run',                         '00000000-0000-0000-0000-00000000000b',
  $$ insert into public.run_reviews (run_id, status, note) select id, 'confirmed', 'asked to cover' from public.runs where leader = 'Roark' and round = 2 and user_id = '00000000-0000-0000-0000-00000000000d' $$);
select pg_temp.check('the owner can read their review',              '00000000-0000-0000-0000-00000000000d',
  $$ do $d$ begin if (select count(*) from public.run_reviews) <> 1 then raise exception 'cannot read'; end if; end $d$ $$);
select pg_temp.check('other members cannot read it',                 '00000000-0000-0000-0000-00000000000f',
  $$ do $d$ begin if (select count(*) from public.run_reviews) <> 0 then raise exception 'leaked'; end if; end $d$ $$);
select pg_temp.check('a member cannot review their own run',         '00000000-0000-0000-0000-00000000000d',
  $$ update public.run_reviews set status = 'confirmed', note = 'self';
     do $d$ begin if (select note from public.run_reviews) = 'self' then raise exception 'self-review worked'; end if; end $d$ $$);
select pg_temp.check('the review does not change points or tickets', '00000000-0000-0000-0000-00000000000b',
  $$ do $d$ begin if (select score from public.runs where leader = 'Roark' and round = 2 and user_id = '00000000-0000-0000-0000-00000000000d') <> 50 then raise exception 'score changed'; end if; end $d$ $$);
select pg_temp.check('moving the run in time re-snapshots and resets the review', '00000000-0000-0000-0000-00000000000d',
  $$ update public.runs set occurred_at = now() - interval '20 minutes' where leader = 'Roark' and round = 2 and user_id = '00000000-0000-0000-0000-00000000000d';
     do $d$ begin if (select count(*) from public.run_reviews) <> 0 then raise exception 'review kept'; end if; if (select main_type_at from public.runs where leader = 'Roark' and round = 2) is distinct from 'Water' then raise exception 'not re-snapshotted'; end if; end $d$ $$);

-- A member who leaves keeps the builds shared with the gym (with the author's name); the private ones go with them
do $$ begin
  insert into public.grid_builds (user_id, pair_id, name, nodes, visibility) values
    ('00000000-0000-0000-0000-00000000000d', '0-red-1996-pikachu', 'Kept for the gym', '{1}', 'gym'),
    ('00000000-0000-0000-0000-00000000000d', '0-red-1996-pikachu', 'Private one', '{1}', 'private');
  delete from public.profiles where id = '00000000-0000-0000-0000-00000000000d';
  if not exists (select 1 from public.grid_builds where name = 'Kept for the gym' and user_id is null and author_name <> '') then raise exception 'shared build lost with its member'; end if;
  if exists (select 1 from public.grid_builds where name = 'Private one') then raise exception 'private build kept'; end if;
end $$;

select format('%s  %s%s', case when ok then 'PASS' else 'FAIL' end, name, case when ok then '' else '  → ' || info end) as result
  from results order by n;
do $$ begin
  if exists (select 1 from results where not ok) then raise exception '% test(s) failed', (select count(*) from results where not ok); end if;
end $$;

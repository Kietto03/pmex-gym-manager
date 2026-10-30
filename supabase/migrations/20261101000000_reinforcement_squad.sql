-- ═══ Core squad and reinforcement squad ═══
-- A member holds one main type (core squad of that type) and may hold one more, the reinforcement type: they back up the core of that
-- type when it struggles. Like the main type, each run keeps the reinforcement type as it was when the battle was logged.
alter table public.season_members add column if not exists support_type text
  check (support_type in ('Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
    'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'));
alter table public.season_members drop constraint if exists season_members_support_differs;
alter table public.season_members add constraint season_members_support_differs check (support_type is null or support_type is distinct from main_type);
alter table public.runs add column if not exists support_type_at text;

create or replace function public.snapshot_run_main_type() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id and new.leader = old.leader
     and new.occurred_at is not distinct from old.occurred_at and new.season_id = old.season_id then
    return new;
  end if;
  select m.main_type, m.support_type into new.main_type_at, new.support_type_at
    from public.season_members m where m.season_id = new.season_id and m.user_id = new.user_id;
  if tg_op = 'UPDATE' then delete from public.run_reviews where run_id = new.id; end if;   -- the context changed: review again
  return new;
end $$;

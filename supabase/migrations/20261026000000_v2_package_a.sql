-- ═══ Version 2.0, package A: timezone, battle roles, real battle time ═══

-- Timezone (IANA name, e.g. Asia/Ho_Chi_Minh); '' = not set
alter table public.profiles add column if not exists timezone text not null default '';

create or replace function public.guard_profile_update() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only the admin can change roles.' using errcode = '42501';
    end if;
    if new.username is distinct from old.username then
      raise exception 'Only the admin can change usernames.' using errcode = '42501';
    end if;
  end if;
  if new.timezone <> '' and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception '"%" is not a valid timezone.', new.timezone;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- One battle role and one main type per member and season, set by staff (null = not assigned yet)
alter table public.season_members add column if not exists battle_role text
  check (battle_role in ('DDs', 'HHs', 'Facilitator', 'Finisher', 'Helper'));
alter table public.season_members add column if not exists main_type text
  check (main_type in ('Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
                       'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'));

-- When the battle really ended, apart from when it was typed in (created_at) or edited (updated_at)
alter table public.runs add column if not exists occurred_at timestamptz;
alter table public.runs add column if not exists occurred_inferred boolean not null default false;   -- true = copied from created_at for an old run
update public.runs set occurred_at = created_at, occurred_inferred = true where occurred_at is null;
alter table public.runs alter column occurred_at set not null;
create index if not exists runs_season_time on public.runs (season_id, occurred_at);

create table if not exists public.run_time_edits (
  id        bigint generated always as identity primary key,
  run_id    bigint not null references public.runs (id) on delete cascade,
  old_at    timestamptz not null,
  new_at    timestamptz not null,
  edited_by uuid references public.profiles (id) on delete set null,
  edited_at timestamptz not null default now()
);
alter table public.run_time_edits enable row level security;
grant select on public.run_time_edits to authenticated;
drop policy if exists "read: staff or run owner" on public.run_time_edits;
create policy "read: staff or run owner" on public.run_time_edits for select to authenticated
  using (public.is_staff() or exists (select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid()));

-- The time only orders the history: it never moves a run to another round or changes the tickets.
create or replace function public.check_run_time() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare s public.seasons;
begin
  select * into s from public.seasons where id = new.season_id;
  if tg_op = 'INSERT' then
    new.occurred_at := coalesce(new.occurred_at, greatest(s.battle_start, least(now(), s.battle_end)));
    new.occurred_inferred := false;
  elsif new.occurred_at is not distinct from old.occurred_at then
    return new;
  end if;
  if new.occurred_at < s.battle_start or new.occurred_at > s.battle_end or new.occurred_at > now() + interval '5 minutes' then
    raise exception 'The battle time must be inside the Gym Battle (and not in the future).';
  end if;
  if tg_op = 'UPDATE' then
    insert into public.run_time_edits (run_id, old_at, new_at, edited_by) values (old.id, old.occurred_at, new.occurred_at, auth.uid());
    new.occurred_inferred := false;
  end if;
  return new;
end $$;
drop trigger if exists runs_time on public.runs;
create trigger runs_time before insert or update on public.runs for each row execute function public.check_run_time();

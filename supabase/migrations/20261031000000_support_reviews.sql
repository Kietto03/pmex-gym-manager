-- ═══ Version 2.0: support runs (a stage of another type than the member's main type) and their review ═══
-- Each run keeps the member's main type as it was when the battle was logged (or its time or member was changed),
-- so changing the assignment later does not rewrite history. A run is "main" when the stage's type (the weakness of
-- its Gym Leader, read by the app) equals that type, "support" when it differs, "unclassified" when either is unknown.
-- A review only confirms the label: it never changes points, tickets or round progress.
alter table public.runs add column if not exists main_type_at text;

create or replace function public.snapshot_run_main_type() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id and new.leader = old.leader
     and new.occurred_at is not distinct from old.occurred_at and new.season_id = old.season_id then
    return new;
  end if;
  new.main_type_at := (select m.main_type from public.season_members m where m.season_id = new.season_id and m.user_id = new.user_id);
  if tg_op = 'UPDATE' then delete from public.run_reviews where run_id = new.id; end if;   -- the context changed: review again
  return new;
end $$;

create table if not exists public.run_reviews (
  run_id      bigint primary key references public.runs (id) on delete cascade,
  status      text not null check (status in ('confirmed', 'needs_correction')),
  note        text not null default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz not null default now()
);
-- (no row = still waiting for review)
drop trigger if exists runs_main_type on public.runs;
create trigger runs_main_type before insert or update on public.runs for each row execute function public.snapshot_run_main_type();
alter table public.run_reviews enable row level security;
grant select, insert, update, delete on public.run_reviews to authenticated;
drop policy if exists "read: staff or run owner" on public.run_reviews;
drop policy if exists "write: staff" on public.run_reviews;
create policy "read: staff or run owner" on public.run_reviews for select to authenticated
  using (public.is_staff() or exists (select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid()));
create policy "write: staff" on public.run_reviews for all to authenticated using (public.is_staff()) with check (public.is_staff());
create or replace function public.stamp_run_review() returns trigger language plpgsql as $$
begin new.reviewed_by := coalesce(auth.uid(), new.reviewed_by); new.reviewed_at := now(); return new; end $$;
drop trigger if exists run_reviews_stamp on public.run_reviews;
create trigger run_reviews_stamp before insert or update on public.run_reviews for each row execute function public.stamp_run_review();

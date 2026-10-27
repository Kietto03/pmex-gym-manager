-- ═══ Version 2.0, package B: strategy library with a review workflow (GvG, D.C 3v1, D.C 3v3) ═══
-- A strategy is a stable identity; its content lives in numbered revisions. Only a published revision is
-- visible to everyone. Editing a published strategy opens a new revision; the published one stays until
-- the new one is approved.
create table if not exists public.strategies (
  id            bigint generated always as identity primary key,
  mode          text not null check (mode in ('GvG', 'DC 3v1', 'DC 3v3')),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  archived      boolean not null default false,
  published_rev bigint
);
create table if not exists public.strategy_revisions (
  id          bigint generated always as identity primary key,
  strategy_id bigint not null references public.strategies (id) on delete cascade,
  rev_no      int not null default 0,
  title       text not null check (length(trim(title)) > 0),
  boss        text not null default '',
  weakness    text not null default '' check (weakness = '' or weakness in ('Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
                'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy')),
  season_label text not null default '',            -- the season or content version it was made for
  conditions  text not null default '',
  team        jsonb not null default '[]' check (jsonb_typeof(team) = 'array' and jsonb_array_length(team) <= 6),   -- [{pair_id, note}]
  grid_note   text not null default '',
  rotation    text not null default '',
  video_url   text not null default '' check (video_url = '' or video_url ~* '^https?://'),
  status      text not null default 'draft' check (status in ('draft', 'pending', 'published', 'changes_requested', 'superseded')),
  author_id   uuid references public.profiles (id) on delete set null,
  review_note text not null default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (strategy_id, rev_no)
);
do $$ begin
  alter table public.strategies add constraint strategies_published_rev_fkey foreign key (published_rev) references public.strategy_revisions (id) on delete set null;
exception when duplicate_object then null; end $$;
alter table public.assignments add column if not exists strategy_rev bigint references public.strategy_revisions (id) on delete set null;

create or replace function public.check_strategy_revision() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); is_author boolean; content_changed boolean;
begin
  if tg_op = 'INSERT' then
    if me is not null then new.author_id := me; end if;
    if exists (select 1 from public.strategy_revisions r where r.strategy_id = new.strategy_id and r.status in ('draft', 'pending', 'changes_requested')) then
      raise exception 'This strategy already has a revision being written or reviewed.';
    end if;
    if new.status not in ('draft', 'pending') then raise exception 'A new revision starts as a draft or is submitted.'; end if;
    new.rev_no := coalesce((select max(rev_no) from public.strategy_revisions where strategy_id = new.strategy_id), 0) + 1;
    new.review_note := ''; new.reviewed_by := null; new.reviewed_at := null;
    return new;
  end if;

  new.updated_at := now();
  if me is null then return new; end if;                  -- scripts and the dashboard
  is_author := old.author_id = me;
  content_changed := (new.title, new.boss, new.weakness, new.season_label, new.conditions, new.team, new.grid_note, new.rotation, new.video_url)
                     is distinct from (old.title, old.boss, old.weakness, old.season_label, old.conditions, old.team, old.grid_note, old.rotation, old.video_url);
  if old.status in ('published', 'superseded') and (content_changed or new.status is distinct from old.status) and not (old.status = 'published' and new.status = 'superseded') then
    raise exception 'A published revision never changes: edit the strategy to open a new revision.';
  end if;
  if content_changed and not (is_author and old.status in ('draft', 'changes_requested')) then
    raise exception 'Only the author can edit a draft or a revision that needs changes.';
  end if;
  if new.status is distinct from old.status then
    if old.status in ('draft', 'changes_requested') and new.status = 'pending' then
      if not is_author then raise exception 'Only the author can submit a revision for review.'; end if;
    elsif old.status = 'pending' and new.status = 'draft' then
      if not is_author then raise exception 'Only the author can take a submitted revision back.'; end if;
    elsif old.status = 'pending' and new.status in ('published', 'changes_requested') then
      if not public.is_staff() then raise exception 'Only a mod or the admin can review a strategy.'; end if;
      if new.status = 'changes_requested' and length(trim(new.review_note)) = 0 then raise exception 'Say what needs to change.'; end if;
      new.reviewed_by := me; new.reviewed_at := now();
      if new.status = 'published' then
        update public.strategy_revisions set status = 'superseded' where strategy_id = new.strategy_id and status = 'published' and id <> new.id;
        update public.strategies set published_rev = new.id where id = new.strategy_id;
      end if;
    elsif old.status = 'published' and new.status = 'superseded' then
      null;
    else
      raise exception 'A % revision cannot become %.', old.status, new.status;
    end if;
  elsif (new.review_note is distinct from old.review_note or new.reviewed_by is distinct from old.reviewed_by) and not public.is_staff() then
    raise exception 'Only a mod or the admin can write a review.';
  end if;
  return new;
end $$;
drop trigger if exists strategy_revisions_check on public.strategy_revisions;
create trigger strategy_revisions_check before insert or update on public.strategy_revisions for each row execute function public.check_strategy_revision();

alter table public.strategies enable row level security;
alter table public.strategy_revisions enable row level security;
grant select, insert, update, delete on public.strategies, public.strategy_revisions to authenticated;
drop policy if exists "read: signed in" on public.strategies;
drop policy if exists "insert: own" on public.strategies;
drop policy if exists "write: staff" on public.strategies;
create policy "read: signed in" on public.strategies for select to authenticated using (true);
create policy "insert: own" on public.strategies for insert to authenticated with check (created_by = auth.uid());
create policy "write: staff" on public.strategies for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "delete: staff" on public.strategies;
create policy "delete: staff" on public.strategies for delete to authenticated using (public.is_staff());
drop policy if exists "read: published, own, or staff" on public.strategy_revisions;
drop policy if exists "insert: own" on public.strategy_revisions;
drop policy if exists "update: author or staff" on public.strategy_revisions;
drop policy if exists "delete: author draft or staff" on public.strategy_revisions;
create policy "read: published, own, or staff" on public.strategy_revisions for select to authenticated
  using (status in ('published', 'superseded') or author_id = auth.uid() or public.is_staff());
create policy "insert: own" on public.strategy_revisions for insert to authenticated with check (author_id = auth.uid() or auth.uid() is null);
create policy "update: author or staff" on public.strategy_revisions for update to authenticated
  using (author_id = auth.uid() or public.is_staff()) with check (author_id = auth.uid() or public.is_staff());
create policy "delete: author draft or staff" on public.strategy_revisions for delete to authenticated
  using ((author_id = auth.uid() and status = 'draft') or public.is_staff());

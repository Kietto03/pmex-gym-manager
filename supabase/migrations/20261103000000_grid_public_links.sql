-- ═══ Sync Grid: "anyone with the link" ═══
-- A build can be shared with anyone who has its link, signed in or not. The link carries an unguessable token (not the build number),
-- and the only way in for someone who is not signed in is `shared_grid(token)`: the table itself stays closed to them.
-- Members of the gym can see a link-shared build like a gym-shared one.
alter table public.grid_builds add column if not exists share_token uuid not null default gen_random_uuid();
create unique index if not exists grid_builds_share_token on public.grid_builds (share_token);
alter table public.grid_builds drop constraint if exists grid_builds_visibility_check;
alter table public.grid_builds add constraint grid_builds_visibility_check check (visibility in ('private', 'gym', 'link'));
drop policy if exists "read: own or shared with the gym" on public.grid_builds;
create policy "read: own or shared with the gym" on public.grid_builds for select to authenticated
  using (user_id = auth.uid() or visibility in ('gym', 'link'));

create or replace function public.shared_grid(p_token uuid) returns jsonb
  language sql stable security definer set search_path = public
as $$
  select to_jsonb(r) from (
    select b.id, b.pair_id, b.name, b.purpose, b.nodes, b.move_level, b.energy_cap, b.visibility, b.grid_hash, b.data_version, b.share_token, b.updated_at,
           null::uuid as user_id, b.author_name
      from public.grid_builds b where b.share_token = p_token and b.visibility = 'link'
  ) r
$$;
revoke all on function public.shared_grid(uuid) from public;
grant execute on function public.shared_grid(uuid) to anon, authenticated;

-- a member who leaves: private builds go, the shared ones (gym or link) stay
create or replace function public.keep_shared_builds() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from public.grid_builds where user_id = old.id and visibility = 'private'; return old; end $$;

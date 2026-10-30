-- ═══ Sync Grid builds outlive their author ═══
-- A build shared with the gym stays when its member leaves (the member's row is deleted): it keeps the name of its author.
-- Private builds go with the member.
alter table public.grid_builds add column if not exists author_name text not null default '';
alter table public.grid_builds alter column user_id drop not null;
alter table public.grid_builds drop constraint if exists grid_builds_user_id_fkey;
alter table public.grid_builds add constraint grid_builds_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null;
update public.grid_builds b set author_name = coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = b.user_id and b.author_name = '';

create or replace function public.stamp_grid_author() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    select coalesce(nullif(display_name, ''), username) into new.author_name from public.profiles where id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists grid_builds_author on public.grid_builds;
create trigger grid_builds_author before insert or update on public.grid_builds for each row execute function public.stamp_grid_author();

create or replace function public.keep_shared_builds() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from public.grid_builds where user_id = old.id and visibility <> 'gym'; return old; end $$;
drop trigger if exists profiles_keep_builds on public.profiles;
create trigger profiles_keep_builds before delete on public.profiles for each row execute function public.keep_shared_builds();

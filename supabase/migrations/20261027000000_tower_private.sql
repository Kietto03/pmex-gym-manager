-- Tower progress is private: members read only their own floors, staff read everyone's
drop policy if exists "read: signed in" on public.tower_progress;
drop policy if exists "read: self or staff" on public.tower_progress;
create policy "read: self or staff" on public.tower_progress for select to authenticated using (user_id = auth.uid() or public.is_staff());

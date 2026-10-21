-- Roster sheet: the Sub-DPS column is split into Sub-DPS Physical and Sub-DPS Special.
-- (For a database created from the main migration this is already the case; run it on one made before.)
alter table public.roster_sheet drop constraint if exists roster_sheet_slot_check;
update public.roster_sheet r set slot = case when c.role = 'Strike (Special)' then 'subspec' else 'subphys' end
  from public.pair_catalog c where r.slot = 'subdps' and c.id = r.pair_id;
delete from public.roster_sheet where slot = 'subdps';
alter table public.roster_sheet add constraint roster_sheet_slot_check check (slot in
  ('special', 'physical', 'wtz', 'rebuff', 'subphys', 'subspec', 'extwtz', 'support', 'other1', 'other2', 'other3'));

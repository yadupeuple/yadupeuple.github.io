-- Badge « Routard du burger » : signaler dans 10 villes différentes (14/11/2026). Image : icons/badges/tour_zone10.webp.
update public.badges set sort_order = sort_order + 1000 where sort_order >= 12 and code <> 'tour_zone10';
update public.badges set sort_order = sort_order - 999 where sort_order >= 1000;
insert into public.badges (code, family, name, description, kind, threshold, is_active, sort_order)
values ('tour_zone10', 'Variété', 'Routard du burger', 'Signaler dans 10 villes différentes', 'cities', 10, true, 12)
on conflict (code) do update set name = excluded.name, description = excluded.description, kind = excluded.kind,
  threshold = excluded.threshold, is_active = true, sort_order = excluded.sort_order;

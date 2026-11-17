-- 17/11/2026 (demande d'Alexis) : badges « restaurants différents » avec les nouvelles images (outils/badges_restos.py) :
-- Explorateur 5 · Gastronome 10 (ancien « Fin gourmet ») · Cartographe 15 · Grand voyageur 20 · Voyageur international 30.
update public.badges set sort_order = sort_order + 1000 where sort_order >= 10;
update public.badges set sort_order = sort_order - 997 where sort_order >= 1000;   -- place pour 3 nouveaux (10, 11, 12)
update public.badges set name = 'Gastronome', description = 'Signaler dans 10 restaurants différents' where code = 'explorer10';
insert into public.badges (code, family, name, description, kind, threshold, is_active, sort_order) values
  ('explorer15', 'Variété', 'Cartographe', 'Signaler dans 15 restaurants différents', 'establishments', 15, true, 10),
  ('explorer20', 'Variété', 'Grand voyageur', 'Signaler dans 20 restaurants différents', 'establishments', 20, true, 11),
  ('explorer30', 'Variété', 'Voyageur international', 'Signaler dans 30 restaurants différents', 'establishments', 30, true, 12)
on conflict (code) do nothing;
-- badges utilisables en image de profil
update public.customizations set sort_order = sort_order + 1000 where kind = 'avatar' and requires_badge is not null and sort_order >= 110;
update public.customizations set sort_order = sort_order - 997 where kind = 'avatar' and requires_badge is not null and sort_order >= 1000;
insert into public.customizations (kind, code, value, min_level, sort_order, is_active, requires_badge) values
  ('avatar', 'badge_explorer15', 'icons/badges/explorer15.webp', 1, 110, true, 'explorer15'),
  ('avatar', 'badge_explorer20', 'icons/badges/explorer20.webp', 1, 111, true, 'explorer20'),
  ('avatar', 'badge_explorer30', 'icons/badges/explorer30.webp', 1, 112, true, 'explorer30')
on conflict (kind, code) do nothing;

-- Correction d'Alexis : « Grand voyageur » = 20 signalements au Drive (pas 20 restaurants), placé juste après « Éclaireur du Drive ».
update public.badges set kind = 'drive_reports', threshold = 20, description = 'Faire 20 signalements au Drive' where code = 'explorer20';
update public.badges set sort_order = sort_order + 1000 where code in ('explorer20','explorer','explorer10','explorer15');
update public.badges set sort_order = 8 where code = 'explorer20';
update public.badges set sort_order = 9 where code = 'explorer';
update public.badges set sort_order = 10 where code = 'explorer10';
update public.badges set sort_order = 11 where code = 'explorer15';
select public.award_badges(p.id) from public.profiles p;

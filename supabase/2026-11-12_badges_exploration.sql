-- Y'a du peuple ? — 2 nouveaux badges Exploration (demande d'Alexis, 12/11/2026)
-- « Fin gourmet » : 10 restaurants différents · « Globe-trotteur » : 6 villes différentes.
-- Ordre d'affichage : rangés juste après leurs petits frères (Explorateur, Tour de la zone).
update public.badges set sort_order = sort_order + 100 where sort_order >= 9;
insert into public.badges(code, family, name, description, kind, threshold, is_active, sort_order) values
  ('explorer10', 'Variété', 'Fin gourmet', 'Signaler dans 10 restaurants différents en gagnant des points', 'establishments', 10, true, 9)
on conflict (code) do nothing;
update public.badges set sort_order = 10 where code = 'tour_zone';
insert into public.badges(code, family, name, description, kind, threshold, is_active, sort_order) values
  ('tour_zone6', 'Variété', 'Globe-trotteur', 'Signaler dans 6 villes différentes en gagnant des points', 'cities', 6, true, 11)
on conflict (code) do nothing;
update public.badges set sort_order = sort_order - 100 + 2 where sort_order >= 100;
-- Attribution immédiate aux comptes qui remplissent déjà les conditions
select public.award_badges(p.id) from public.profiles p;

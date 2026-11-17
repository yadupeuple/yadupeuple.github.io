-- 17/11/2026 (demande d'Alexis) : nouveaux niveaux des rubans, ruban vert (feuilles) ajouté au niveau 16,
-- images de profil Glace et Café ajoutées au niveau 1 (planche 1, découpées par outils/extract.py, recentrées).

update public.customizations c set min_level = v.lvl, sort_order = 1000 + v.ord, is_active = true
from (values
  ('ruban_ciel', 1, 0), ('ruban_bonbon', 1, 1), ('ruban_turquoise', 1, 2), ('ruban_orange', 1, 3),
  ('ruban_violet', 3, 4), ('ruban_laurier', 5, 5), ('ruban_nuit', 8, 6), ('ruban_vache', 10, 7),
  ('ruban_damier', 12, 8), ('ruban_flammes', 14, 9), ('ruban_vert', 16, 10), ('ruban_engrenage', 20, 11),
  ('ruban_coeur', 25, 12), ('ruban_fleurs', 30, 13), ('ruban_flocon', 40, 14), ('ruban_etoile_violet', 50, 15),
  ('ruban_diamant', 60, 16), ('ruban_etoile_or', 70, 17), ('ruban_flamme_violet', 85, 18), ('ruban_couronne', 100, 19)
) as v(code, lvl, ord)
where c.code = v.code and c.kind = 'banner';
update public.customizations set sort_order = sort_order - 1000 where kind = 'banner' and sort_order >= 1000;

-- Glace et Café juste après les tacos (niveau 1)
update public.customizations set sort_order = sort_order + 1000 where kind = 'avatar' and requires_badge is null and sort_order >= 6;
update public.customizations set sort_order = sort_order - 998 where kind = 'avatar' and requires_badge is null and sort_order >= 1000;
insert into public.customizations (kind, code, value, min_level, sort_order, is_active)
values ('avatar', 'glace', 'icons/avatars/glace.webp', 1, 6, true),
       ('avatar', 'cafe', 'icons/avatars/cafe.webp', 1, 7, true)
on conflict (kind, code) do update set value = excluded.value, min_level = excluded.min_level, sort_order = excluded.sort_order, is_active = true;

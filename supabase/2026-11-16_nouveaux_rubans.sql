-- 16/11/2026 (demande d'Alexis) : nouveaux rubans (planches ChatGPT du 16/11, outils/rubans_sheet2.py).
-- 10 rubans simples pour les premiers niveaux (4 au niveau 1), 9 rubans à ornements (sans celui à la coupe),
-- rangés du moins au plus prestigieux (couronne rouge = niveau 100).
-- Les 10 anciens rubans sont désactivés (pas supprimés) : ornement au milieu, gênant pour le pseudo.
update public.customizations set is_active = false where kind = 'banner';
insert into public.customizations(kind, code, value, min_level, sort_order, is_active) values
  ('banner', 'ruban_ciel', 'icons/banners/ruban_ciel.webp', 1, 0, true),
  ('banner', 'ruban_bonbon', 'icons/banners/ruban_bonbon.webp', 1, 1, true),
  ('banner', 'ruban_turquoise', 'icons/banners/ruban_turquoise.webp', 1, 2, true),
  ('banner', 'ruban_orange', 'icons/banners/ruban_orange.webp', 1, 3, true),
  ('banner', 'ruban_violet', 'icons/banners/ruban_violet.webp', 3, 4, true),
  ('banner', 'ruban_laurier', 'icons/banners/ruban_laurier.webp', 5, 5, true),
  ('banner', 'ruban_nuit', 'icons/banners/ruban_nuit.webp', 8, 6, true),
  ('banner', 'ruban_vache', 'icons/banners/ruban_vache.webp', 10, 7, true),
  ('banner', 'ruban_damier', 'icons/banners/ruban_damier.webp', 12, 8, true),
  ('banner', 'ruban_flammes', 'icons/banners/ruban_flammes.webp', 15, 9, true),
  ('banner', 'ruban_fleurs', 'icons/banners/ruban_fleurs.webp', 20, 10, true),
  ('banner', 'ruban_coeur', 'icons/banners/ruban_coeur.webp', 25, 11, true),
  ('banner', 'ruban_flocon', 'icons/banners/ruban_flocon.webp', 30, 12, true),
  ('banner', 'ruban_engrenage', 'icons/banners/ruban_engrenage.webp', 40, 13, true),
  ('banner', 'ruban_etoile_or', 'icons/banners/ruban_etoile_or.webp', 50, 14, true),
  ('banner', 'ruban_diamant', 'icons/banners/ruban_diamant.webp', 60, 15, true),
  ('banner', 'ruban_flamme_violet', 'icons/banners/ruban_flamme_violet.webp', 70, 16, true),
  ('banner', 'ruban_etoile_violet', 'icons/banners/ruban_etoile_violet.webp', 85, 17, true),
  ('banner', 'ruban_couronne', 'icons/banners/ruban_couronne.webp', 100, 18, true)
on conflict (kind, code) do update set value = excluded.value, min_level = excluded.min_level,
  sort_order = excluded.sort_order, is_active = true;
update public.profiles set banner = case banner when 'ruban_vert' then 'ruban_turquoise' when 'ruban_rose' then 'ruban_bonbon' else 'ruban_ciel' end
where banner is null or banner not in (select code from public.customizations where kind = 'banner' and is_active);
alter table public.profiles alter column banner set default 'ruban_ciel';

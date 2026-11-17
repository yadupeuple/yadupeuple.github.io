-- 17/11/2026 (demande d'Alexis) : 2 badges de régularité en plus (famille Moments, kind 'weeks').
-- Fidèle : 8 semaines d'affilée ; Inarrêtable : 12 semaines. Images : planche d'Alexis
-- (outils/src/badges_semaines/semaines_4.png et _6.png, découpe outils/badge_detoure2.py) ; les 5 autres gardées en réserve.
update public.badges set sort_order = sort_order + 1000 where sort_order > 14;  -- sort_order unique : décalage en 2 temps
update public.badges set sort_order = sort_order - 998 where sort_order > 1000;
insert into public.badges(code, kind, name, family, is_active, threshold, sort_order, description) values
  ('regulier8', 'weeks', 'Fidèle', 'Moments', true, 8, 15, 'Faire au moins 1 signalement par semaine pendant 8 semaines'),
  ('regulier12', 'weeks', 'Inarrêtable', 'Moments', true, 12, 16, 'Faire au moins 1 signalement par semaine pendant 12 semaines')
on conflict (code) do update set kind = excluded.kind, name = excluded.name, family = excluded.family, is_active = true,
  threshold = excluded.threshold, sort_order = excluded.sort_order, description = excluded.description;
update public.customizations set sort_order = sort_order + 1000 where kind = 'avatar' and sort_order > 114;
update public.customizations set sort_order = sort_order - 998 where kind = 'avatar' and sort_order > 1000;
insert into public.customizations(kind, code, value, min_level, sort_order, is_active, requires_badge) values
  ('avatar', 'badge_regulier8', 'icons/badges/regulier8.webp', 1, 115, true, 'regulier8'),
  ('avatar', 'badge_regulier12', 'icons/badges/regulier12.webp', 1, 116, true, 'regulier12')
on conflict (kind, code) do update set value = excluded.value, sort_order = excluded.sort_order, is_active = true, requires_badge = excluded.requires_badge;

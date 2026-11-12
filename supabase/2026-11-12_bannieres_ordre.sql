-- Y'a du peuple ? — Bannières : 2 au départ, thèmes alternés (demande d'Alexis, 12/11/2026), ajout « ciel » (montgolfière)
insert into public.customizations(kind, code, value, min_level, sort_order, is_active) values
  ('banner', 'nuit', 'icons/banners/nuit.webp', 1, 0, true),
  ('banner', 'ciel', 'icons/banners/ciel.webp', 1, 1, true),
  ('banner', 'plage', 'icons/banners/plage.webp', 5, 2, true),
  ('banner', 'ville', 'icons/banners/ville.webp', 10, 3, true),
  ('banner', 'foret', 'icons/banners/foret.webp', 15, 4, true),
  ('banner', 'confettis', 'icons/banners/confettis.webp', 20, 5, true),
  ('banner', 'hiver', 'icons/banners/hiver.webp', 25, 6, true),
  ('banner', 'geometrique', 'icons/banners/geometrique.webp', 30, 7, true),
  ('banner', 'automne', 'icons/banners/automne.webp', 35, 8, true),
  ('banner', 'sunset', 'icons/banners/sunset.webp', 40, 9, true),
  ('banner', 'montagne', 'icons/banners/montagne.webp', 45, 10, true),
  ('banner', 'vagues', 'icons/banners/vagues.webp', 50, 11, true),
  ('banner', 'printemps', 'icons/banners/printemps.webp', 60, 12, true),
  ('banner', 'retro', 'icons/banners/retro.webp', 70, 13, true),
  ('banner', 'tropical', 'icons/banners/tropical.webp', 80, 14, true),
  ('banner', 'phare', 'icons/banners/phare.webp', 90, 15, true),
  ('banner', 'espace', 'icons/banners/espace.webp', 100, 16, true)
on conflict (kind, code) do update set value = excluded.value, min_level = excluded.min_level,
  sort_order = excluded.sort_order, is_active = true;
update public.profiles p set banner = 'nuit'
where not exists (select 1 from public.customizations c where c.kind = 'banner' and c.code = p.banner and c.is_active
  and c.min_level <= (select max(l.level) from public.levels l where l.min_points <= p.points));

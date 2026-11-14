-- Zone de Carcassonne / Limoux (Aude), 14/11/2026. Restos trouvés via Maps + OpenStreetMap.
-- Drive : sites officiels (Burger King, KFC) ; McDonald's « drive » d'après Maps ; Quick sans drive (OSM).
-- Horaires : sites officiels (BK, KFC) et OpenStreetMap ; Subway : horaires types 11 h-22 h (à vérifier).
-- Pas de courbe Google pour l'instant (navigateur indisponible) : l'appli utilise la courbe type ; à relever avec outils/maj_courbes.md.
-- Écartés : Popeyes, Domino's, indépendants (enseignes hors liste) ; aucun BK/KFC/Quick à Limoux.

insert into public.establishments (name, brand, city, address, lat, lng, has_dine_in, has_drive)
select v.name, v.brand, v.city, v.address, v.lat, v.lng, true, v.drive from (values
  ('McDonald''s Carcassonne Cité', 'McDonald''s', 'Carcassonne', 'N113, Rond-point d''Europe, 11090 Carcassonne', 43.2072786, 2.3846265, true),
  ('McDonald''s Carcassonne Salvaza', 'McDonald''s', 'Carcassonne', 'Zone commerciale de Salvaza, 11000 Carcassonne', 43.2065116, 2.311301, true),
  ('McDonald''s Limoux', 'McDonald''s', 'Limoux', 'ZI Le Flassian, Route de Carcassonne, 11300 Limoux', 43.0746314, 2.2201895, true),
  ('Burger King Carcassonne Pont-Rouge', 'Burger King', 'Carcassonne', 'ZI du Pont-Rouge, Rue Magellan, 11000 Carcassonne', 43.2351145, 2.3669453, true),
  ('Burger King Carcassonne Salvaza', 'Burger King', 'Carcassonne', 'Centre commercial Salvaza, 330 Boulevard Henry Bouffet, 11000 Carcassonne', 43.2087194, 2.3088303, true),
  ('Burger King Carcassonne Rocadest', 'Burger King', 'Carcassonne', '19 D Rue Joséphine Baker, 11000 Carcassonne', 43.2066846, 2.3919667, true),
  ('KFC Carcassonne Salvaza', 'KFC', 'Carcassonne', 'Zone commerciale La Ferraudière, 11000 Carcassonne', 43.203938, 2.3121126, true),
  ('KFC Carcassonne Rocadest', 'KFC', 'Carcassonne', '19C Rue Joséphine Baker, 11000 Carcassonne', 43.2066305, 2.3933997, true),
  ('Quick Carcassonne Salvaza', 'Quick', 'Carcassonne', 'Planeto Nord, ZAC de Salvaza, 11000 Carcassonne', 43.2015792, 2.3148644, false),
  ('O''Tacos Carcassonne', 'O''Tacos', 'Carcassonne', '3 Rue Georges Clemenceau, 11000 Carcassonne', 43.213716, 2.3521106, false),
  ('Subway Carcassonne Clemenceau', 'Subway', 'Carcassonne', '38 Rue Georges Clemenceau, 11000 Carcassonne', 43.214722, 2.3522544, false),
  ('Subway Carcassonne Henry Bouffet', 'Subway', 'Carcassonne', '43 Boulevard Henry Bouffet, 11000 Carcassonne', 43.2090762, 2.3094894, false),
  ('Buffalo Grill Carcassonne', 'Buffalo Grill', 'Carcassonne', 'N113, Route de Narbonne, 11000 Carcassonne', 43.2065221, 2.3866519, false),
  ('Buffalo Grill Carcassonne Salvaza', 'Buffalo Grill', 'Carcassonne', 'Bretelle A61, Chemin de Maquens, 11000 Carcassonne', 43.200396, 2.312648, false)
) as v(name, brand, city, address, lat, lng, drive)
where not exists (select 1 from public.establishments e where e.name = v.name);

insert into public.opening_hours (establishment_id, hours, source)
select e.id, v.hours::jsonb, 'officiel_osm' from (values
  ('McDonald''s Carcassonne Cité', '[[[540, 1440]], [[540, 1440]], [[540, 1440]], [[540, 1440]], [[540, 1440]], [[540, 1560]], [[540, 1560]]]'),
  ('McDonald''s Carcassonne Salvaza', '[[[540, 1440]], [[540, 1440]], [[540, 1440]], [[540, 1440]], [[540, 1440]], [[540, 1560]], [[540, 1560]]]'),
  ('McDonald''s Limoux', '[[[540, 1380]], [[540, 1380]], [[540, 1380]], [[540, 1380]], [[540, 1380]], [[540, 1440]], [[540, 1440]]]'),
  ('Burger King Carcassonne Pont-Rouge', '[[[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]]]'),
  ('Burger King Carcassonne Salvaza', '[[[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1380]], [[660, 1380]]]'),
  ('Burger King Carcassonne Rocadest', '[[[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1380]], [[660, 1380]]]'),
  ('KFC Carcassonne Salvaza', '[[[660, 1350]], [[660, 1350]], [[660, 1350]], [[660, 1350]], [[660, 1350]], [[660, 1350]], [[660, 1350]]]'),
  ('KFC Carcassonne Rocadest', '[[[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]]]'),
  ('Quick Carcassonne Salvaza', '[[[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]]]'),
  ('O''Tacos Carcassonne', '[[[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]]]'),
  ('Subway Carcassonne Clemenceau', '[[[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]]]'),
  ('Subway Carcassonne Henry Bouffet', '[[[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]]]'),
  ('Buffalo Grill Carcassonne', '[[[690, 1320]], [[690, 900], [1080, 1320]], [[690, 900], [1080, 1320]], [[690, 900], [1080, 1320]], [[690, 900], [1080, 1320]], [[690, 900], [1080, 1350]], [[690, 1350]]]'),
  ('Buffalo Grill Carcassonne Salvaza', '[[[690, 1320]], [[690, 900], [1080, 1320]], [[690, 900], [1080, 1320]], [[690, 900], [1080, 1320]], [[690, 900], [1080, 1320]], [[690, 900], [1080, 1350]], [[690, 1350]]]')
) as v(name, hours)
join public.establishments e on e.name = v.name
on conflict (establishment_id) do update set hours = excluded.hours, source = excluded.source, updated_at = now();

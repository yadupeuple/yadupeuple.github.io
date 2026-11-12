-- Restos manqués autour de Jarny et Woippy (13/11/2026), trouvés via OpenStreetMap + Maps ; horaires, courbes
-- d'affluence et Drive (« Service de drive ») relevés sur Google Maps. Trouvé en passant : Burger King Clouange.
-- Déjà présents : Quick Woippy (= « Quick Metz Fort Gambetta »), restos de Semécourt. Écarté : Subway Woippy (définitivement fermé).
-- Aucun Burger King, KFC, Quick, Subway, O'Tacos, Starbucks ni Flunch à Jarny (seulement des indépendants).

insert into public.establishments (name, brand, city, address, lat, lng, has_dine_in, has_drive)
select v.name, v.brand, v.city, v.address, v.lat, v.lng, true, v.drive from (values
  ('McDonald''s Conflans-en-Jarnisy', 'McDonald''s', 'Conflans-en-Jarnisy', 'ZI du Val de l''Orne, RN 3, 54800 Conflans-en-Jarnisy', 49.165186, 5.844772, true),
  ('McDonald''s Woippy', 'McDonald''s', 'Woippy', '53 Avenue de Thionville, 57140 Woippy', 49.1488051, 6.1608358, true),
  ('KFC Semécourt', 'KFC', 'Semécourt', 'Centre commercial Auchan, Voie Romaine, 57280 Semécourt', 49.1927456, 6.1466962, true),
  ('McDonald''s Aire de Saint-Privat (A4)', 'McDonald''s', 'Saint-Privat-la-Montagne', 'Aire de Metz Saint-Privat, A4, 57855 Saint-Privat-la-Montagne', 49.1791745, 6.0542172, false),
  ('Subway Metz Muse', 'Subway', 'Metz', 'Centre commercial Muse, 1 Rue des Messageries, 57000 Metz', 49.107261, 6.181068, false),
  ('Burger King Clouange', 'Burger King', 'Clouange', 'ZAC de la Bellefontaine, 57185 Clouange', 49.2582657, 6.0852415, true)
) as v(name, brand, city, address, lat, lng, drive)
where not exists (select 1 from public.establishments e where e.name = v.name);

insert into public.opening_hours (establishment_id, hours, source)
select e.id, v.hours::jsonb, 'google_maps' from (values
  ('McDonald''s Conflans-en-Jarnisy', '[[[510, 1440]], [[510, 1440]], [[510, 1440]], [[510, 1440]], [[510, 1440]], [[510, 1440]], [[510, 1440]]]'),
  ('McDonald''s Woippy', '[[[510, 1440]], [[510, 1440]], [[510, 1440]], [[510, 1440]], [[510, 1440]], [[510, 1440]], [[510, 1440]]]'),
  ('KFC Semécourt', '[[[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]]]'),
  ('McDonald''s Aire de Saint-Privat (A4)', '[[[600, 1320]], [[600, 1320]], [[600, 1320]], [[600, 1320]], [[600, 1320]], [[600, 1320]], [[600, 1320]]]'),
  ('Subway Metz Muse', '[[[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]], [[660, 1320]]]'),
  ('Burger King Clouange', '[[[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1440]], [[660, 1440]]]')
) as v(name, hours)
join public.establishments e on e.name = v.name
on conflict (establishment_id) do update set hours = excluded.hours, source = excluded.source, updated_at = now();

insert into public.popular_times (establishment_id, profile, source, updated_at)
select e.id, v.profile::smallint[], 'google_maps', now() from (values
  ('McDonald''s Conflans-en-Jarnisy', '{NULL,NULL,NULL,NULL,NULL,NULL,0,0,15,20,27,38,40,35,32,27,40,59,81,100,94,62,38,25,NULL,NULL,NULL,NULL,NULL,NULL,0,0,20,23,33,32,32,33,52,69,77,66,59,40,33,23,22,16,NULL,NULL,NULL,NULL,NULL,NULL,0,0,23,30,44,62,49,42,40,47,50,59,69,76,62,40,27,20,NULL,NULL,NULL,NULL,NULL,NULL,0,0,27,38,47,59,57,55,54,54,61,67,84,76,66,52,40,32,NULL,NULL,NULL,NULL,NULL,NULL,0,0,10,18,20,30,37,54,62,79,86,96,98,93,76,54,37,25,NULL,NULL,NULL,NULL,NULL,NULL,0,0,20,33,44,44,40,38,50,61,77,79,84,89,83,64,50,35,NULL,NULL,NULL,NULL,NULL,NULL,0,0,30,49,62,69,59,55,69,88,94,98,94,93,77,50,37,30}'),
  ('McDonald''s Woippy', '{NULL,NULL,NULL,NULL,NULL,NULL,0,0,9,13,25,43,65,70,71,62,57,54,70,94,92,75,47,24,NULL,NULL,NULL,NULL,NULL,NULL,0,0,19,17,32,53,82,76,58,48,42,54,60,67,60,50,31,20,NULL,NULL,NULL,NULL,NULL,NULL,0,0,16,23,38,62,84,81,62,47,41,48,71,83,70,58,34,16,NULL,NULL,NULL,NULL,NULL,NULL,0,0,13,17,28,47,70,72,70,57,52,60,69,64,51,45,40,30,NULL,NULL,NULL,NULL,NULL,NULL,0,0,13,17,28,43,61,57,43,35,40,49,54,61,53,49,35,26,NULL,NULL,NULL,NULL,NULL,NULL,0,0,14,24,41,70,100,97,90,70,57,54,70,89,90,74,50,30,NULL,NULL,NULL,NULL,NULL,NULL,0,0,17,27,30,46,53,64,54,43,40,47,64,82,76,62,35,17}'),
  ('KFC Semécourt', '{NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,42,46,50,43,38,40,53,72,87,82,69,44,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,34,44,48,51,46,41,41,48,67,58,54,42,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,46,71,65,53,42,46,57,79,89,74,51,37,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,53,65,58,45,38,30,39,51,67,61,51,35,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,58,74,77,61,45,46,57,64,67,61,44,27,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,54,72,71,56,43,34,41,61,82,81,73,58,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,57,79,95,88,67,55,60,80,100,92,60,31,0}'),
  ('McDonald''s Aire de Saint-Privat (A4)', '{NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,28,40,48,48,62,85,82,65,54,45,37,31,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,42,62,62,65,57,74,77,74,60,60,48,40,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,28,42,51,42,42,51,60,57,48,31,31,31,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,48,57,68,74,74,68,65,71,57,48,45,45,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,37,37,40,51,45,40,45,48,48,51,57,51,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,45,54,77,88,100,77,62,45,45,31,31,37,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,77,91,94,91,68,54,37,37,34,31,31,40,0,0}'),
  ('Subway Metz Muse', '{NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,64,54,52,37,52,64,79,64,52,45,41,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,62,60,56,47,58,60,85,85,79,66,56,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,41,50,45,43,41,52,58,52,50,64,75,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,60,58,58,50,45,39,43,54,50,52,54,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,50,52,45,54,56,58,56,54,50,58,56,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,58,58,50,41,47,54,77,97,72,64,39,0,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,52,64,83,93,100,85,68,43,50,56,58,0,0}'),
  ('Burger King Clouange', '{NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,12,20,24,23,19,22,29,45,55,51,36,19,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,34,44,45,47,54,63,70,68,57,37,22,14,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,32,42,47,50,57,66,77,74,61,39,19,7,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,30,42,45,52,57,65,75,77,66,47,30,15,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,34,46,49,56,62,69,74,68,58,40,25,13,0,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,42,57,59,57,62,75,85,90,85,63,43,24,14,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0,0,0,61,80,86,90,91,97,100,97,80,57,37,24,14}')
) as v(name, profile)
join public.establishments e on e.name = v.name
on conflict (establishment_id) do update set profile = excluded.profile, source = excluded.source, updated_at = now();

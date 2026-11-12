-- Nouvelles enseignes (12/11/2026), choisies par Alexis : O'Tacos (tous ceux de la zone), Starbucks, Flunch, Five Guys
-- + le McDonald's de Saint-Julien-lès-Metz qui manquait.
-- Adresses et coordonnées relevées sur Maps (Firecrawl) le 12/11/2026. Five Guys : aucun restaurant en Moselle (Nancy, Strasbourg, Luxembourg).
-- Drive : seulement le McDonald's de Saint-Julien (McDrive confirmé sur mcdonalds.fr). Les autres : salle seulement.
-- Horaires connus ajoutés pour 2 restos (sources : mcdonalds.fr, pagesjaunes.fr) ; jour 0 = dimanche, minutes depuis minuit.

insert into public.establishments (name, brand, city, address, lat, lng, has_dine_in, has_drive)
select v.name, v.brand, v.city, v.address, v.lat, v.lng, true, v.drive
from (values
  ('O''Tacos Semécourt',            'O''Tacos',    'Semécourt',            'Centre commercial Auchan, Voie Romaine, 57280 Semécourt', 49.1950366, 6.1460141, false),
  ('O''Tacos Metz Saint-Jacques',   'O''Tacos',    'Metz',                 '19 Rue de Ladoucette, 57000 Metz',                        49.1181169, 6.1762619, false),
  ('O''Tacos Metz Muse',            'O''Tacos',    'Metz',                 'Centre commercial Muse, 2 Rue des Messageries, 57000 Metz', 49.1064781, 6.1822616, false),
  ('Starbucks Metz Gare',           'Starbucks',   'Metz',                 '1 Place du Général de Gaulle, 57000 Metz',                49.1096438, 6.1771948, false),
  ('Starbucks Metz Petit Paris',    'Starbucks',   'Metz',                 '9 Rue du Petit Paris, 57000 Metz',                        49.1181632, 6.1754068, false),
  ('Starbucks Metz Muse',           'Starbucks',   'Metz',                 'Centre commercial Muse, 2 Rue des Messageries, 57000 Metz', 49.1065934, 6.1821104, false),
  ('Starbucks Moulins-lès-Metz',    'Starbucks',   'Moulins-lès-Metz',     '1 Chemin de la Pie Grièche, 57160 Moulins-lès-Metz',       49.0809855, 6.1046410, false),
  ('Starbucks Thionville',          'Starbucks',   'Thionville',           '17 Rue de Paris, 57100 Thionville',                       49.3574096, 6.1663766, false),
  ('Flunch Semécourt',              'Flunch',      'Semécourt',            'Centre commercial Auchan, Voie Romaine, 57280 Semécourt', 49.1938400, 6.1455080, false),
  ('Flunch Fameck',                 'Flunch',      'Fameck',               '1 Avenue François Mitterrand, 57290 Fameck',              49.3065880, 6.1197011, false),
  ('Flunch Thionville',             'Flunch',      'Thionville',           'Centre commercial Carrefour Geric, 4 Rue du Maillet, 57100 Thionville', 49.3559005, 6.1413675, false),
  ('McDonald''s Saint-Julien-lès-Metz', 'McDonald''s', 'Saint-Julien-lès-Metz', '12 bis Avenue Paul Langevin, 57070 Saint-Julien-lès-Metz', 49.1340566, 6.1990263, true)
) as v(name, brand, city, address, lat, lng, drive)
where not exists (select 1 from public.establishments e where e.name = v.name);

insert into public.opening_hours (establishment_id, hours, source)
select e.id, h.hours::jsonb, h.source
from (values
  ('McDonald''s Saint-Julien-lès-Metz', '[[[510,1440]],[[510,1440]],[[510,1440]],[[510,1440]],[[510,1440]],[[510,1440]],[[510,1440]]]', 'mcdonalds.fr'),
  ('Starbucks Moulins-lès-Metz',        '[[],[[510,1200]],[[510,1200]],[[510,1200]],[[510,1200]],[[510,1200]],[[510,1200]]]',            'pagesjaunes.fr')
) as h(name, hours, source)
join public.establishments e on e.name = h.name
on conflict (establishment_id) do nothing;

-- 15/11/2026 : ajout national des KFC et Subway (absents d'AllThePlaces) depuis OpenStreetMap (Overpass),
-- téléchargés par la base : select import.fetch_brand('KFC','Q524757'); select import.fetch_brand('Subway','Q244457');
-- Ville manquante dans OSM → commune officielle via geo.api.gouv.fr (API publique gratuite de l'État).
create table if not exists import.osm_rows (
  brand text, osm_id text, lat float8, lng float8, name text, street text, postcode text, city text,
  drive text, opening_hours text, geo_done boolean default false, primary key (brand, osm_id));
revoke all on import.osm_rows from public, anon, authenticated;

insert into import.osm_rows (brand, osm_id, lat, lng, name, street, postcode, city, drive, opening_hours)
select o.brand, el->>'type' || '/' || (el->>'id'),
  coalesce((el->>'lat')::float8, (el->'center'->>'lat')::float8), coalesce((el->>'lon')::float8, (el->'center'->>'lon')::float8),
  el->'tags'->>'name',
  nullif(btrim(coalesce(el->'tags'->>'addr:housenumber', '') || ' ' || coalesce(el->'tags'->>'addr:street', '')), ''),
  el->'tags'->>'addr:postcode', import.nice_city(el->'tags'->>'addr:city'),
  el->'tags'->>'drive_through', el->'tags'->>'opening_hours'
from import.osm_raw o, jsonb_array_elements(o.payload->'elements') el
where o.brand in ('KFC', 'Subway') and el->'tags'->>'amenity' = 'fast_food'
  and not (el->'tags' ? 'disused:amenity')
on conflict do nothing;

-- Commune + code postal officiels (par lots, appelé plusieurs fois)
create or replace function import.osm_geo(p_limit int default 120) returns int language plpgsql security definer set search_path = '' as $fn$
declare r record; resp extensions.http_response; j jsonb; n int := 0;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');
  for r in select * from import.osm_rows where not geo_done limit p_limit loop
    begin
      resp := extensions.http_get(format('https://geo.api.gouv.fr/communes?lat=%s&lon=%s&fields=nom,codesPostaux&format=json', r.lat, r.lng));
      j := case when resp.status = 200 then resp.content::jsonb -> 0 end;
      update import.osm_rows set geo_done = true,
        city = coalesce(j->>'nom', city), postcode = coalesce(postcode, j->'codesPostaux'->>0)
      where brand = r.brand and osm_id = r.osm_id;
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return n;
end $fn$;
revoke all on function import.osm_geo(int) from public, anon, authenticated;

-- Les requêtes geo.api.gouv.fr ont finalement été envoyées en parallèle par pg_net :
--   alter table import.osm_rows add column if not exists req_id bigint;
--   update import.osm_rows set req_id = net.http_get(format('https://geo.api.gouv.fr/communes?lat=%s&lon=%s&fields=nom,codesPostaux&format=json', lat, lng)) where not geo_done;
--   (1 min plus tard) update import.osm_rows o set geo_done = true, city = coalesce(r.content::jsonb->0->>'nom', o.city), ...
--     from net._http_response r where r.id = o.req_id and r.status_code = 200;

-- Ajout dans l'appli. Drive : tag OSM ; KFC sans info → Drive (la grande majorité des KFC français en ont un), Subway sans info → pas de Drive.
-- Resto déjà présent (même enseigne < 200 m) : seulement relié. Doublons OSM (point + bâtiment) : un seul gardé (< 80 m).
create or replace function import.apply_osm() returns table(brand text, added int, linked int) language plpgsql security definer set search_path = '' as $fn$
declare b text; r record; n_add int; n_link int; nm text; new_id uuid;
begin
  foreach b in array array['KFC', 'Subway'] loop
    n_add := 0; n_link := 0;
    for r in select o.* from import.osm_rows o where o.brand = b order by o.osm_id loop
      if exists (select 1 from public.establishments e where e.source = 'osm' and e.source_ref = r.osm_id) then continue; end if;
      if exists (select 1 from public.establishments e where e.brand = b and public.distance_m(e.lat, e.lng, r.lat, r.lng) < 80
                 and e.source = 'osm') then continue; end if;
      update public.establishments e set source = 'osm', source_ref = r.osm_id
       where e.id = (select e2.id from public.establishments e2 where e2.brand = b and e2.source_ref is null
                     and public.distance_m(e2.lat, e2.lng, r.lat, r.lng) < 200 limit 1);
      if found then n_link := n_link + 1; continue; end if;
      if exists (select 1 from public.establishments e where e.brand = b and public.distance_m(e.lat, e.lng, r.lat, r.lng) < 200) then continue; end if;
      nm := b || ' ' || r.city;
      if exists (select 1 from public.establishments e where e.name = nm) or
         (select count(*) from import.osm_rows o2 where o2.brand = b and o2.city = r.city) > 1 then
        nm := nm || coalesce(' ' || nullif(regexp_replace(coalesce(r.street, ''), '^\d+\s*', ''), ''), ' ' || right(r.osm_id, 4));
      end if;
      insert into public.establishments (name, brand, city, address, lat, lng, has_dine_in, has_drive, source, source_ref)
      values (left(nm, 120), b, left(r.city, 100),
              nullif(btrim(coalesce(r.street, '') || E'\n' || coalesce(r.postcode || ' ', '') || r.city), ''),
              r.lat, r.lng, true,
              case when r.drive = 'yes' then true when r.drive = 'no' then false else b = 'KFC' end,
              'osm', r.osm_id)
      returning id into new_id;
      if import.oh_parse(r.opening_hours) is not null then
        insert into public.opening_hours (establishment_id, hours, source) values (new_id, import.oh_parse(r.opening_hours), 'osm')
        on conflict do nothing;
      end if;
      n_add := n_add + 1;
    end loop;
    brand := b; added := n_add; linked := n_link; return next;
  end loop;
end $fn$;
revoke all on function import.apply_osm() from public, anon, authenticated;

-- Exécuté : select * from import.apply_osm();  → KFC +368 (11 reliés), Subway +307 (7 reliés).
-- Rues manquantes : import.osm_street(n) (api-adresse.data.gouv.fr/reverse, 0,3 s entre deux appels), puis noms et adresses :
--   nom = enseigne + ville (+ rue si plusieurs dans la même ville, + n° si encore en double) ; adresse = rue \n CP ville
--   (pas de CP pour Paris/Lyon/Marseille : l'API donne seulement le 1er arrondissement).
-- KFC sans info Drive en centre-ville (Paris, ou ≥ 6 restos à moins de 700 m) → pas de Drive. Bilan : 320 KFC avec Drive sur 379.

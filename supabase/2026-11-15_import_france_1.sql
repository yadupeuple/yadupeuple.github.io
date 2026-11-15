-- Import France entière (15/11/2026), étape 1 : téléchargement OpenStreetMap (Overpass) par la base elle-même.
create extension if not exists http with schema extensions;
create schema if not exists import;
revoke all on schema import from public, anon, authenticated;
create table if not exists import.osm_raw (
  brand text primary key,
  fetched_at timestamptz default now(),
  payload jsonb
);
-- Une enseigne : brand:wikidata, en France métropolitaine (Corse comprise)
create or replace function import.fetch_brand(p_brand text, p_wikidata text, p_key text default 'brand:wikidata')
returns int language plpgsql security definer set search_path = '' as $$
declare r extensions.http_response; q text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '170');
  q := format('[out:json][timeout:160];area["ISO3166-1"="FR"][admin_level=2]->.fr;nwr["%s"="%s"](area.fr)(41.2,-5.6,51.2,9.7);out tags center;', p_key, p_wikidata);
  r := extensions.http_post('https://overpass-api.de/api/interpreter', 'data=' || extensions.urlencode(q), 'application/x-www-form-urlencoded');
  if r.status <> 200 then raise exception 'Overpass % : %', r.status, left(r.content, 200); end if;
  insert into import.osm_raw(brand, payload) values (p_brand, r.content::jsonb)
  on conflict (brand) do update set payload = excluded.payload, fetched_at = now();
  return jsonb_array_length(r.content::jsonb -> 'elements');
end $$;
revoke all on function import.fetch_brand(text, text, text) from public, anon, authenticated;

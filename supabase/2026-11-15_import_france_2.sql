-- Import France entière (15/11/2026), étape 2 : source AllThePlaces (localisateurs officiels des enseignes,
-- run 2026-10-31), téléchargée par la base (pg_net / http) dans import.atp_raw, puis mise au format de l'appli.
alter table public.establishments add column if not exists source text, add column if not exists source_ref text;
create unique index if not exists establishments_source_ref_idx on public.establishments (source, source_ref) where source_ref is not null;

-- Horaires OSM (« Mo-Fr 11:00-22:00; Sa 11:00-23:00 ») -> format appli : 7 listes (0 = dimanche), minutes,
-- fermeture après minuit > 1440 ; les créneaux « 00:00-01:00 » sont rattachés à la veille.
create or replace function import.oh_parse(t text) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  days int[][]; d jsonb[] := array['[]','[]','[]','[]','[]','[]','[]']::jsonb[];
  rule text; dpart text; tpart text; m text[]; seg text; rng text; a int; b int; i int; s int; e int;
  sel boolean[]; names text[] := array['Su','Mo','Tu','We','Th','Fr','Sa']; out jsonb[]; x jsonb; prev int; extra jsonb;
begin
  if t is null or btrim(t) = '' then return null; end if;
  if t ~ '24/7' then return '[[[0,1440]],[[0,1440]],[[0,1440]],[[0,1440]],[[0,1440]],[[0,1440]],[[0,1440]]]'::jsonb; end if;
  foreach rule in array regexp_split_to_array(t, ';') loop
    rule := btrim(rule);
    if rule = '' or rule ~ '^(PH|SH)' then continue; end if;
    m := regexp_match(rule, '^((?:Mo|Tu|We|Th|Fr|Sa|Su)[A-Za-z ,\-]*?)\s+(.*)$');
    sel := array[false,false,false,false,false,false,false];
    if m is null then
      if rule !~ '^\d' then continue; end if;
      sel := array[true,true,true,true,true,true,true]; tpart := rule;
    else
      dpart := m[1]; tpart := btrim(m[2]);
      foreach rng in array regexp_split_to_array(replace(dpart, ' ', ''), ',') loop
        a := array_position(names, left(rng, 2)) - 1;
        b := case when rng like '%-%' then array_position(names, right(rng, 2)) - 1 else a end;
        if a is null or b is null then continue; end if;
        i := a;
        loop sel[i + 1] := true; exit when i = b; i := (i + 1) % 7; end loop;
      end loop;
    end if;
    x := '[]';
    if tpart !~* '^(off|closed)' then
      foreach seg in array regexp_split_to_array(tpart, ',') loop
        m := regexp_match(btrim(seg), '^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})');
        if m is null then continue; end if;
        s := m[1]::int * 60 + m[2]::int; e := m[3]::int * 60 + m[4]::int;
        if e <= s then e := e + 1440; end if;
        x := x || jsonb_build_array(jsonb_build_array(s, e));
      end loop;
    end if;
    for i in 1..7 loop if sel[i] then d[i] := x; end if; end loop;
  end loop;
  -- créneaux de nuit (début 00:00, fin avant 6 h) -> prolongent la veille
  out := d;
  for i in 1..7 loop
    prev := case when i = 1 then 7 else i - 1 end;
    for x in select * from jsonb_array_elements(d[i]) loop
      if (x->>0)::int = 0 and (x->>1)::int <= 360 and (x->>1)::int > 0 then
        out[i] := (select coalesce(jsonb_agg(y), '[]') from jsonb_array_elements(out[i]) y where y <> x);
        extra := (select y from jsonb_array_elements(out[prev]) y where (y->>1)::int = 1440 limit 1);
        if extra is not null then
          out[prev] := (select jsonb_agg(case when y = extra then jsonb_build_array((y->>0)::int, 1440 + (x->>1)::int) else y end) from jsonb_array_elements(out[prev]) y);
        else
          out[prev] := out[prev] || jsonb_build_array(jsonb_build_array(1440, 1440 + (x->>1)::int));
        end if;
      end if;
    end loop;
  end loop;
  return to_jsonb(out);
end $$;

create or replace function import.nice_city(c text) returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(regexp_replace(initcap(lower(btrim(c))),
    '\m(De|Des|Du|La|Le|Les|Sur|Sous|En|Et|Aux|Au|L|D)\M', lower('\1'), 'g'), '\s+', ' ', 'g')), '')
$$;

-- Mise en forme de toutes les enseignes téléchargées
create or replace view import.atp_rows as
select a.spider, f->'properties'->>'ref' as ref,
  coalesce(f->'properties'->>'brand', '') as brand,
  (f->'geometry'->'coordinates'->>1)::float8 as lat, (f->'geometry'->'coordinates'->>0)::float8 as lng,
  coalesce(import.nice_city(f->'properties'->>'addr:city'),
           import.nice_city((regexp_match(f->'properties'->>'addr:full', '\d{5}\s*([^\d,]+)$'))[1]),
           import.nice_city(f->'properties'->>'branch')) as city,
  import.nice_city(f->'properties'->>'branch') as branch,
  coalesce(f->'properties'->>'addr:street_address', f->'properties'->>'addr:full') as street,
  f->'properties'->>'addr:postcode' as postcode,
  f->'properties'->>'drive_through' as drive_through,
  f->'properties'->>'opening_hours' as opening_hours,
  f->'properties'->>'addr:country' as country
from import.atp_raw a, jsonb_array_elements(a.payload->'features') f
where f->'geometry'->>'type' = 'Point';

-- Les fichiers Starbucks (Europe) et Subway (monde) sont filtrés sur la France ligne par ligne (téléchargements très gros)
create or replace function import.lines_to_features(c text, p_country text default null) returns jsonb language plpgsql set search_path = '' as $$
declare ln text; f jsonb; arr jsonb := '[]';
begin
  foreach ln in array regexp_split_to_array(c, E'\n') loop
    ln := regexp_replace(btrim(ln), ',$', '');
    if left(ln, 1) <> '{' or ln not like '%"Feature"%' then continue; end if;
    if p_country is not null and ln !~ ('"addr:country": ?"' || p_country || '"') then continue; end if;
    begin f := ln::jsonb; exception when others then continue; end;
    arr := arr || jsonb_build_array(f);
  end loop;
  return jsonb_build_object('features', arr);
end $$;

-- Import dans l'appli : France métropolitaine uniquement ; un resto déjà présent (même enseigne à moins de 200 m) est gardé
-- tel quel (horaires et courbes Google relevés à la main) et seulement relié à sa référence officielle.
create or replace function import.apply_atp() returns table(spider text, added int, linked int) language plpgsql security definer set search_path = '' as $$
begin
  create temp table r on commit drop as
  select x.*, import.oh_parse(x.opening_hours) as hours,
    btrim(regexp_replace(regexp_replace(coalesce(x.street, ''), '\s*-?\s*\d{5}.*$', ''), '\s+', ' ', 'g')) as street_clean,
    coalesce(x.postcode, (regexp_match(x.street, '(\d{5})'))[1]) as pc
  from import.atp_rows x
  where coalesce(x.country, 'FR') = 'FR' and x.lat between 41.2 and 51.2 and x.lng between -5.6 and 9.7 and x.ref is not null;

  -- liens avec les restos existants
  update public.establishments e set source = 'atp:' || r.spider, source_ref = r.ref
  from r where e.source_ref is null and e.brand = r.brand and public.distance_m(e.lat, e.lng, r.lat, r.lng) < 200;

  return query
  with ins as (
    insert into public.establishments (name, brand, city, address, lat, lng, has_dine_in, has_drive, source, source_ref)
    select left(r.brand || ' ' || coalesce(r.branch, r.city), 120), r.brand, left(r.city, 100),
      nullif(concat_ws(', ', nullif(case when r.street_clean = upper(r.street_clean) then initcap(lower(r.street_clean)) else r.street_clean end, ''),
                       btrim(coalesce(r.pc, '') || ' ' || r.city)), ''),
      r.lat, r.lng, true, coalesce(r.drive_through = 'yes', false), 'atp:' || r.spider, r.ref
    from r
    where not exists (select 1 from public.establishments e where e.source = 'atp:' || r.spider and e.source_ref = r.ref)
      and not exists (select 1 from public.establishments e where e.brand = r.brand and public.distance_m(e.lat, e.lng, r.lat, r.lng) < 200)
    on conflict do nothing
    returning establishments.id, establishments.source, establishments.source_ref
  ), hrs as (
    insert into public.opening_hours (establishment_id, hours, source)
    select ins.id, r.hours, 'atp' from ins join r on 'atp:' || r.spider = ins.source and r.ref = ins.source_ref
    where r.hours is not null
    on conflict (establishment_id) do nothing
    returning 1
  )
  select replace(ins.source, 'atp:', ''), count(*)::int, 0 from ins group by 1;
end $$;
revoke all on function import.apply_atp() from public, anon, authenticated;

-- 15/11/2026 (accord d'Alexis) : suppression des 94 doublons « McCafé » (situés dans des McDonald's)
delete from public.opening_hours where establishment_id in (select id from public.establishments where brand='McCafé' and source like 'atp:%');
delete from public.establishments where brand='McCafé' and source like 'atp:%' and not exists (select 1 from public.reports r where r.establishment_id = establishments.id);

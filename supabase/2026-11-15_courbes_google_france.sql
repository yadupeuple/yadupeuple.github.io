-- 15/11/2026 : courbes d'affluence Google Maps pour tous les restos (demandé par Alexis : « tout d'un coup »).
-- Relevé dans son Chrome par outils/gmaps_batch.js (iframes google.com/maps, 3 en parallèle, lieu vérifié à < 500 m).
-- Les résultats arrivent dans import.gmaps_raw via la fonction temporaire import_gmaps_batch (protégée par un jeton
-- stocké dans import.secrets) ; À SUPPRIMER une fois le relevé terminé (voir bas du fichier).
create table if not exists import.gmaps_raw (id uuid primary key, nm text, prof smallint[], ferme text, err text, d int, received_at timestamptz default now());
revoke all on import.gmaps_raw from public, anon, authenticated;
create table if not exists import.secrets (k text primary key, v text);
revoke all on import.secrets from public, anon, authenticated;
-- insert into import.secrets values ('gmaps_batch', '<jeton>');   (jeton non recopié ici)
-- create or replace function public.import_gmaps_batch(p_token text, p_rows jsonb) ... (voir migration gmaps_batch_staging)

-- Intégration dans popular_times (même format que les relevés à la main : 0 de 6 h à 23 h quand Google n'affiche rien,
-- NULL la nuit sauf valeur Google). Les courbes déjà présentes (relevés à la main) ne sont pas écrasées.
create or replace function import.apply_gmaps() returns int language plpgsql security definer set search_path = '' as $fn$
declare n int;
begin
  insert into public.popular_times (establishment_id, profile, source, updated_at)
  select g.id,
    (select array_agg(case when (i - 1) % 24 >= 6 then coalesce(g.prof[i], 0) else g.prof[i] end order by i) from generate_series(1, 168) i),
    'google_maps', now()
  from import.gmaps_raw g
  where g.prof is not null and g.err is null
    and not exists (select 1 from public.popular_times p where p.establishment_id = g.id);
  get diagnostics n = row_count; return n;
end $fn$;
revoke all on function import.apply_gmaps() from public, anon, authenticated;

-- FIN DU RELEVÉ : drop function public.import_gmaps_batch(text, jsonb); delete from import.secrets where k = 'gmaps_batch';

-- Intégration automatique à chaque arrivée (trigger), au lieu d'appeler apply_gmaps à la main :
create or replace function import.gmaps_raw_apply() returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.prof is not null and new.err is null then
    insert into public.popular_times (establishment_id, profile, source, updated_at)
    values (new.id, (select array_agg(case when (i - 1) % 24 >= 6 then coalesce(new.prof[i], 0) else new.prof[i] end order by i) from generate_series(1, 168) i), 'google_maps', now())
    on conflict (establishment_id) do nothing;
  end if;
  return new;
end $fn$;
drop trigger if exists gmaps_raw_apply on import.gmaps_raw;
create trigger gmaps_raw_apply after insert or update on import.gmaps_raw for each row execute function import.gmaps_raw_apply();

-- 16/11/2026 9 h 33 : relevé terminé (4 173 fiches, 3 546 courbes, 611 sans courbe Google, 87 « fermé » signalés par Google,
-- 16 introuvables). Accès coupé : execute retiré à anon/authenticated + jeton remplacé par une valeur aléatoire
-- (la suppression de la fonction reste à faire : drop function public.import_gmaps_batch(text, jsonb);).
revoke execute on function public.import_gmaps_batch(text, jsonb) from anon, authenticated, public;
update import.secrets set v = encode(gen_random_bytes(32), 'hex') where k = 'gmaps_batch';

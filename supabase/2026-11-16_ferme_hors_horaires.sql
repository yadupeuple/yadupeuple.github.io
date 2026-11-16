-- 16/11/2026 (Alexis) : un resto fermé (hors horaires) ne doit plus apparaître « Calme », ni être proposé en « plus calme à côté ».
-- is_open_now : même logique que openState (js/levels.js) : hours = 7 jours (0 = dimanche), plages en minutes, > 1440 = après minuit.
-- NULL si horaires inconnus (on garde alors le comportement actuel).
create or replace function public.is_open_now(p_establishment uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
declare h jsonb; t timestamp := now() at time zone 'Europe/Paris'; d int := extract(dow from t)::int;
        m int := extract(hour from t)::int * 60 + extract(minute from t)::int; r jsonb;
begin
  select o.hours into h from public.opening_hours o where o.establishment_id = p_establishment;
  if h is null or jsonb_typeof(h) <> 'array' or jsonb_array_length(h) <> 7 then return null; end if;
  for r in select * from jsonb_array_elements(h -> ((d + 6) % 7)) loop
    if (r->>1)::int > 1440 and m < (r->>1)::int - 1440 then return true; end if;
  end loop;
  for r in select * from jsonb_array_elements(h -> d) loop
    if m >= (r->>0)::int and m < (r->>1)::int then return true; end if;
  end loop;
  return false;
end $fn$;
grant execute on function public.is_open_now(uuid) to anon, authenticated;

-- get_service_status : renvoie state 'ferme' (sans niveau) quand le resto est fermé.
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_service_status'::regproc);
  n := regexp_replace(d, '(  select\s+count\(\*\),\s+coalesce\(sum\(v\.w\), 0\),)',
    E'  if public.is_open_now(p_establishment) is false then\n    return jsonb_build_object(''state'', ''ferme'', ''level'', null, ''uncertain'', false, ''wait'', null);\n  end if;\n\n\\1');
  if n = d then raise exception 'motif introuvable'; end if;
  execute n;
end $do$;

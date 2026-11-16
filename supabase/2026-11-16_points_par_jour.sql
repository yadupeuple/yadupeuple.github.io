-- 16/11/2026 (accord d'Alexis) : anti « je reste 4 h au même resto ».
-- Par compte, par resto et par jour (heure de Paris) :
--   1er signalement 10 pts, 2e 5 pts, puis 1 pt par mise à jour, au plus 4 mises à jour payées ;
--   au-delà, signalement accepté sans point (capped = true dans la réponse).
-- window_pos = rang du signalement dans la journée pour ce resto.
insert into public.app_settings(key, value, description)
values ('max_update_points_per_day', '4', 'Mises à jour payées (1 pt) par resto et par jour, après les 10 + 5 pts')
on conflict (key) do update set value = excluded.value, description = excluded.description;

do $$
declare d text; a int; b int; blk text;
begin
  d := replace(pg_get_functiondef('public.submit_report'::regproc), E'\r\n', E'\n');
  a := position('  select r.id, r.created_at into first_rep' in d);
  b := position('  -- Plafond quotidien' in d);
  if a = 0 or b = 0 or b < a then raise exception 'repères introuvables'; end if;
  blk := $n$  select count(*) into n
  from public.reports r
  where r.user_id = uid
    and r.establishment_id = p_establishment
    and (r.created_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date;
  pos := least(n + 1, 32767)::smallint;
  pts := case
    when pos = 1 then public.setting('points_first')::int
    when pos = 2 then public.setting('points_second')::int
    when pos - 2 <= public.setting('max_update_points_per_day')::int then public.setting('points_update')::int
    else 0
  end;

$n$;
  d := substr(d, 1, a - 1) || blk || substr(d, b);
  d := replace(d, $o$    'window_pos', pos,$o$, $o$    'window_pos', pos,
    'capped', (pts = 0 and pos > 2),$o$);
  if position('capped' in d) = 0 then raise exception 'retour non modifié'; end if;
  execute d;
end $$;

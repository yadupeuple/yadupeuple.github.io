-- 16/11/2026 (demande d'Alexis) : classement = 100 premiers (réglage ranking_top) + toujours la ligne du joueur.
insert into public.app_settings(key, value, description)
values ('ranking_top', '100', 'Nombre de joueurs affichés dans le classement (+ la ligne du joueur)')
on conflict (key) do update set value = excluded.value;

do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.get_ranking'::regproc), E'\r\n', E'\n');
  d := replace(d, 'where rk.rnk <= 10 or rk.me', $r$where rk.rnk <= public.setting('ranking_top')::int or rk.me$r$);
  if position('ranking_top' in d) = 0 then raise exception 'remplacement non appliqué'; end if;
  execute d;
end $$;

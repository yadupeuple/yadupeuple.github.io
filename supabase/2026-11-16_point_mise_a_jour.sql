-- 16/11/2026 (demande d'Alexis) : dans la même heure et le même resto, les signalements
-- après le 2e rapportent 1 point (mise à jour) au lieu de 0. Réglage points_update.
insert into public.app_settings(key, value, description)
values ('points_update', '1', 'Points des signalements suivants (3e et +) dans la même heure et le même resto')
on conflict (key) do update set value = excluded.value, description = excluded.description;

do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.submit_report'::regproc), E'\r\n', E'\n');
  d := replace(d, $o$      when pos = 2 then public.setting('points_second')::int
      else 0$o$, $n$      when pos = 2 then public.setting('points_second')::int
      else public.setting('points_update')::int$n$);
  if position('points_update' in d) = 0 then raise exception 'remplacement non appliqué'; end if;
  execute d;
end $$;

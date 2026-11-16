-- 16/11/2026 (demande d'Alexis) : un même service (salle ou Drive) d'un même resto
-- ne peut être signalé qu'une fois toutes les 30 min par compte (avant : 2 min).
-- Le message indique dans combien de minutes on pourra le refaire.
update public.app_settings set value = '1800',
  description = 'Délai minimal entre deux signalements du même service (même resto, même compte)'
where key = 'min_gap_seconds';

do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.submit_report'::regproc), E'\r\n', E'\n');
  d := replace(d,
$o$  if exists (
    select 1 from public.reports r
    where r.user_id = uid
      and r.establishment_id = p_establishment
      and r.service = p_service
      and r.created_at > now() - make_interval(secs => public.setting('min_gap_seconds')::double precision)
  ) then
    return public.report_error('too_soon');
  end if;$o$,
$n$  select max(r.created_at) into prev_at
  from public.reports r
  where r.user_id = uid
    and r.establishment_id = p_establishment
    and r.service = p_service
    and r.created_at > now() - make_interval(secs => public.setting('min_gap_seconds')::double precision);
  if prev_at is not null then
    return public.report_error('too_soon') || jsonb_build_object(
      'wait_min', ceil(extract(epoch from (prev_at + make_interval(secs => public.setting('min_gap_seconds')::double precision) - now())) / 60)::int,
      'message', 'Tu as déjà signalé ' || case when p_service = 'drive' then 'le Drive' else 'la salle' end
        || ' ici. Tu pourras le refaire dans '
        || ceil(extract(epoch from (prev_at + make_interval(secs => public.setting('min_gap_seconds')::double precision) - now())) / 60)::int
        || ' min.');
  end if;
  prev_at := null;$n$);
  if position('wait_min' in d) = 0 then raise exception 'remplacement non appliqué'; end if;
  execute d;
end $$;

-- 16/11/2026 16:20, accord d'Alexis : suppression des 2 signalements en double (0 point)
-- de Maylixela au McDonald's Fameck (salle 16:10, Drive 16:13).
delete from public.reports where id in ('fa3b2883-2bc0-4a69-8b22-11246b123af4','42a4aecb-1c54-45ab-b072-25e68e9c7044');

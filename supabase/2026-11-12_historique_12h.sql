-- Historique des signalements (12/11/2026) : on ne montre plus ceux de plus de 12 h (décision d'Alexis).
-- Durée réglable dans app_settings (history_max_hours).

insert into public.app_settings (key, value, description)
values ('history_max_hours', 12, 'Âge maximum (heures) des signalements affichés dans « Derniers signalements »')
on conflict (key) do update set value = excluded.value, description = excluded.description;

create or replace function public.get_history(p_establishment uuid, p_service text, p_limit integer default 5)
returns table(level text, minutes_ago integer)
language sql stable security definer set search_path to ''
as $function$
  select r.level, (extract(epoch from now() - r.created_at) / 60)::int
  from public.reports r
  where r.establishment_id = p_establishment
    and r.service = p_service
    and p_service in ('salle', 'drive')
    and r.created_at > now() - make_interval(hours => coalesce(
          (select s.value::int from public.app_settings s where s.key = 'history_max_hours'), 12))
  order by r.created_at desc, r.id desc
  limit greatest(1, least(coalesce(p_limit, 5), 5))
$function$;

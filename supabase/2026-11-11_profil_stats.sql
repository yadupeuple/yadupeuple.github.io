-- Y'a du peuple ? — Profil : ajoute des statistiques personnelles à get_my_profile()
-- (nombre de signalements, restos différents, signalements sur 30 jours, resto le plus signalé,
--  date d'inscription). Les champs existants sont inchangés.

create or replace function public.get_my_profile()
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'pseudo', p.pseudo,
    'points', p.points,
    'level', l.level,
    'level_name', l.name,
    'next_level_at', (
      select min(x.min_points) from public.levels x where x.min_points > p.points
    ),
    'badges', coalesce((
      select jsonb_agg(ub.badge_code order by ub.earned_at)
      from public.user_badges ub where ub.user_id = p.id
    ), '[]'::jsonb),
    'member_since', p.created_at,
    'reports_total', (select count(*) from public.reports r where r.user_id = p.id),
    'reports_30d', (select count(*) from public.reports r where r.user_id = p.id
                    and r.created_at > now() - interval '30 days'),
    'restos_total', (select count(distinct r.establishment_id) from public.reports r where r.user_id = p.id),
    'top_resto', (
      select e.name from public.reports r
      join public.establishments e on e.id = r.establishment_id
      where r.user_id = p.id
      group by e.id, e.name
      order by count(*) desc, max(r.created_at) desc
      limit 1
    )
  )
  from public.profiles p
  join lateral (
    select lv.level, lv.name
    from public.levels lv
    where lv.min_points <= p.points
    order by lv.min_points desc
    limit 1
  ) l on true
  where p.id = auth.uid()
$function$;

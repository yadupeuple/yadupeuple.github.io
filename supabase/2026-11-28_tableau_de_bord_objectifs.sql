-- 28/11/2026 : tableau de bord du test, 2 objectifs ajoutés (demande d'Alexis, après l'analyse du potentiel) :
--   * fidélité : part des comptes de 15 jours et plus (compte admin exclu) qui ont signalé ces 7 derniers jours (objectif 1 sur 3) ;
--   * direct à midi : par jour (14 derniers), nombre de restos de la zone Thionville-Metz (lat 49,00-49,47, lng 5,85-6,45)
--     signalés entre 12 h et 14 h, heure de Paris (objectif 15) ; idem le soir (19 h-21 h), pour information.
-- Changer de zone (ex. Mulhouse) : modifier le rectangle et le nom 'zone' ci-dessous.

create or replace function public.get_admin_dashboard()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Europe/Paris')::date;
  res json;
begin
  if auth.uid() is null or not public.is_app_admin() then
    return json_build_object('ok', false, 'message', 'Réservé à l''administrateur.');
  end if;
  with days as (select generate_series(d - 20, d, interval '1 day')::date as day),
  r as (select x.*, (x.created_at at time zone 'Europe/Paris')::date as day from public.reports x),
  p as (select x.*, (x.created_at at time zone 'Europe/Paris')::date as day from public.profiles x)
  select json_build_object(
    'ok', true,
    'generated_at', now(),
    'accounts', json_build_object(
      'total', (select count(*) from p),
      'today', (select count(*) from p where p.day = d),
      'week', (select count(*) from p where p.day > d - 7),
      'with_report', (select count(distinct user_id) from r where user_id is not null),
      'active_7d', (select count(distinct user_id) from r where r.day > d - 7 and user_id is not null),
      'testeur_badges', (select count(*) from public.user_badges where badge_code = 'testeur'),
      'referred', (select count(*) from p where referred_by is not null),
      'push_users', (select count(distinct user_id) from public.push_subscriptions),
      'favorites', (select count(*) from public.favorites)
    ),
    'reports', json_build_object(
      'total', (select count(*) from r),
      'today', (select count(*) from r where r.day = d),
      'week', (select count(*) from r where r.day > d - 7),
      'salle_21d', (select count(*) from r where r.day > d - 21 and service = 'salle'),
      'drive_21d', (select count(*) from r where r.day > d - 21 and service = 'drive')
    ),
    'days', (select json_agg(json_build_object('day', x.day,
               'reports', (select count(*) from r where r.day = x.day),
               'signups', (select count(*) from p where p.day = x.day)) order by x.day) from days x),
    'cities', (select coalesce(json_agg(c), '[]'::json) from (
               select coalesce(e.city, '?') as city, count(*) as n from r join public.establishments e on e.id = r.establishment_id
               where r.day > d - 21 group by 1 order by 2 desc limit 5) c),
    'top', (select coalesce(json_agg(t), '[]'::json) from (
               select pr.pseudo, count(*) as n, max(r.created_at) as last_at from r join public.profiles pr on pr.id = r.user_id
               where r.day > d - 21 group by pr.pseudo order by 2 desc, 3 desc limit 10) t),
    'feedback', json_build_object(
      'total', (select count(*) from public.feedback),
      'week', (select count(*) from public.feedback where created_at > now() - interval '7 days'),
      'last', (select coalesce(json_agg(f), '[]'::json) from (
               select fb.created_at, coalesce(pr.pseudo, 'sans compte') as pseudo, fb.message, fb.context
               from public.feedback fb left join public.profiles pr on pr.id = fb.user_id
               order by fb.created_at desc limit 10) f)
    ),
    'errors', json_build_object(
      'rows_24h', (select count(*) from public.app_errors where created_at > now() - interval '24 hours'),
      'hits_24h', (select coalesce(sum(hits), 0) from public.app_errors where created_at > now() - interval '24 hours'),
      'last', (select coalesce(json_agg(x), '[]'::json) from (
               select created_at, message, screen, app_version, hits from public.app_errors order by id desc limit 5) x)
    ),
    'push', json_build_object('sent_7d', (select count(*) from public.push_log where sent_at > now() - interval '7 days')),
    -- Objectifs du test (28/11/2026) : fidélité et direct à midi dans la zone de test
    'goals', json_build_object(
      'retention', (
        select json_build_object(
          'cohort', count(*),
          'reported_ever', count(*) filter (where exists (select 1 from public.reports x where x.user_id = c.id)),
          'active_7d', count(*) filter (where exists (select 1 from public.reports x where x.user_id = c.id and x.created_at > now() - interval '7 days')))
        from public.profiles c
        where c.created_at <= now() - interval '14 days'
          and not exists (select 1 from public.app_admins aa where aa.user_id = c.id)),
      'target_pct', 33,
      'zone', 'Thionville-Metz',
      'lunch_target', 15,
      'lunch', (select json_agg(json_build_object('day', x.day,
                 'midi', (select count(distinct r.establishment_id) from r join public.establishments e on e.id = r.establishment_id
                          where r.day = x.day and e.lat between 49.0 and 49.47 and e.lng between 5.85 and 6.45
                            and (r.created_at at time zone 'Europe/Paris')::time >= time '12:00'
                            and (r.created_at at time zone 'Europe/Paris')::time < time '14:00'),
                 'soir', (select count(distinct r.establishment_id) from r join public.establishments e on e.id = r.establishment_id
                          where r.day = x.day and e.lat between 49.0 and 49.47 and e.lng between 5.85 and 6.45
                            and (r.created_at at time zone 'Europe/Paris')::time >= time '19:00'
                            and (r.created_at at time zone 'Europe/Paris')::time < time '21:00')) order by x.day)
               from days x where x.day > d - 14)
    )
  ) into res;
  return res;
end $$;
revoke all on function public.get_admin_dashboard() from public, anon;
grant execute on function public.get_admin_dashboard() to authenticated;

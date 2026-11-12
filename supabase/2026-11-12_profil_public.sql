-- Y'a du peuple ? — Classement avec image de profil + profil public (sans contact)
-- Profil public : pseudo, image, bannière, niveau, points, ancienneté, nombre de signalements/restos, badges.
-- Jamais d'e-mail, ni de resto favori ou habituel, ni de lieu.

drop function if exists public.get_ranking(text, text);
create function public.get_ranking(p_scope text default 'month', p_city text default null)
returns table(rang integer, pseudo text, points bigint, is_me boolean, avatar text)
language sql
stable security definer
set search_path to ''
as $function$
  with scores as (
    select r.user_id, sum(r.points_awarded)::bigint as pts
    from public.reports r
    join public.establishments e on e.id = r.establishment_id
    where r.user_id is not null
      and (p_scope = 'all' and p_city is not null
           or p_scope <> 'all' and r.created_at >= (date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'))
      and (p_city is null or e.city = p_city)
    group by r.user_id
    having sum(r.points_awarded) > 0
    union all
    select p.id, p.points::bigint
    from public.profiles p
    where p_scope = 'all' and p_city is null and p.points > 0
  ),
  ranked as (
    select row_number() over (order by s.pts desc, p.pseudo)::int as rnk,
           p.pseudo as ps, s.pts as total,
           coalesce(s.user_id = auth.uid(), false) as me,
           p.avatar as av
    from scores s
    join public.profiles p on p.id = s.user_id
  )
  select rk.rnk, rk.ps, rk.total, rk.me, rk.av
  from ranked rk
  where rk.rnk <= 10 or rk.me
  order by rk.rnk
$function$;
grant execute on function public.get_ranking(text, text) to anon, authenticated;

create or replace function public.get_public_profile(p_pseudo text)
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'pseudo', p.pseudo,
    'avatar', p.avatar,
    'banner', p.banner,
    'points', p.points,
    'level', l.level,
    'level_name', l.name,
    'member_since', p.created_at,
    'reports_total', (select count(*) from public.reports r where r.user_id = p.id and r.points_awarded > 0),
    'restos_total', (select count(distinct r.establishment_id) from public.reports r where r.user_id = p.id and r.points_awarded > 0),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name) order by b.sort_order)
      from public.user_badges ub join public.badges b on b.code = ub.badge_code
      where ub.user_id = p.id
    ), '[]'::jsonb)
  )
  from public.profiles p
  join lateral (
    select lv.level, lv.name from public.levels lv
    where lv.min_points <= p.points order by lv.min_points desc limit 1
  ) l on true
  where p.pseudo = p_pseudo
$function$;
grant execute on function public.get_public_profile(text) to anon, authenticated;

-- Y'a du peuple ? — Classements : « ce mois-ci » (remis à zéro le 1er du mois, heure de Paris)
-- et « depuis le début » (points totaux). Top 10 + ma ligne.
create or replace function public.get_ranking(p_scope text default 'month', p_city text default null)
returns table(rang integer, pseudo text, points bigint, is_me boolean)
language sql
stable security definer
set search_path to ''
as $function$
  with scores as (
    -- Ce mois-ci, ou depuis le début dans une ville : points des signalements
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
    -- Depuis le début, toute la zone : points totaux du profil (parrainage compris)
    select p.id, p.points::bigint
    from public.profiles p
    where p_scope = 'all' and p_city is null and p.points > 0
  ),
  ranked as (
    select row_number() over (order by s.pts desc, p.pseudo)::int as rnk,
           p.pseudo as ps, s.pts as total,
           coalesce(s.user_id = auth.uid(), false) as me
    from scores s
    join public.profiles p on p.id = s.user_id
  )
  select rk.rnk, rk.ps, rk.total, rk.me
  from ranked rk
  where rk.rnk <= 10 or rk.me
  order by rk.rnk
$function$;

grant execute on function public.get_ranking(text, text) to anon, authenticated;

-- 16/11/2026 (demande d'Alexis) : podium (top 3) du mois précédent, affiché dans Classement > Ce mois-ci.
-- Même règle que get_ranking('month') : points des signalements du mois (heure de Paris).
create or replace function public.get_last_month_podium()
returns table(rang integer, pseudo text, points bigint, avatar text, banner text, mois text)
language sql stable security definer set search_path = '' as $$
  with bornes as (
    select (date_trunc('month', now() at time zone 'Europe/Paris') - interval '1 month') at time zone 'Europe/Paris' as d0,
           date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' as d1,
           to_char(date_trunc('month', now() at time zone 'Europe/Paris') - interval '1 month', 'YYYY-MM') as m
  ), scores as (
    select r.user_id, sum(r.points_awarded)::bigint as pts
    from public.reports r, bornes b
    where r.user_id is not null and r.created_at >= b.d0 and r.created_at < b.d1
    group by r.user_id having sum(r.points_awarded) > 0
  )
  select (row_number() over (order by s.pts desc, p.pseudo))::int, p.pseudo, s.pts, p.avatar, p.banner, (select m from bornes)
  from scores s join public.profiles p on p.id = s.user_id
  order by s.pts desc, p.pseudo
  limit 3
$$;
revoke all on function public.get_last_month_podium() from public;
grant execute on function public.get_last_month_podium() to anon, authenticated;

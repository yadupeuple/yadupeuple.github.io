-- Champion de ville (28/11/2026, v231, idée validée par Alexis)
-- Chaque mois, dans chaque ville, le compte qui a le plus de signalements validés (points > 0)
-- devient « Champion de <ville> » pour ce mois. Minimum 5 signalements validés dans la ville.
-- Égalité : plus de jours différents, puis celui qui a atteint son total le premier.
-- Calcul automatique le 1er du mois (pg_cron), pour le mois précédent (heure de Paris).

create table if not exists public.city_champions (
  month   date not null,            -- 1er jour du mois
  city    text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reports int  not null,
  primary key (month, city)
);
alter table public.city_champions enable row level security;   -- aucune règle : pas d'accès direct
create index if not exists city_champions_user on public.city_champions(user_id);

insert into public.app_settings(key, value, description)
values ('champion_min_reports', 5, 'Champion de ville : signalements validés minimum dans le mois') on conflict (key) do nothing;

create or replace function public.compute_city_champions(p_month date default null)
returns int language plpgsql security definer set search_path to '' as $$
declare
  m date := coalesce(date_trunc('month', p_month)::date,
                     (date_trunc('month', now() at time zone 'Europe/Paris') - interval '1 month')::date);
  n int;
begin
  delete from public.city_champions where month = m;
  insert into public.city_champions(month, city, user_id, reports)
  select m, city, user_id, nb from (
    select e.city, r.user_id, count(*) nb,
           row_number() over (partition by e.city
             order by count(*) desc,
                      count(distinct (r.created_at at time zone 'Europe/Paris')::date) desc,
                      max(r.created_at) asc) rk
    from public.reports r
    join public.establishments e on e.id = r.establishment_id
    where r.user_id is not null and r.points_awarded > 0 and coalesce(e.city, '') <> ''
      and (r.created_at at time zone 'Europe/Paris') >= m
      and (r.created_at at time zone 'Europe/Paris') <  m + interval '1 month'
    group by e.city, r.user_id
    having count(*) >= public.setting('champion_min_reports')::int
  ) x where rk = 1;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.compute_city_champions(date) from public, anon, authenticated;

-- Titres d'un compte (les plus récents d'abord)
create or replace function public.city_titles(p_user uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('city', c.city, 'month', c.month) order by c.month desc, c.city), '[]'::jsonb)
  from public.city_champions c where c.user_id = p_user
$$;
revoke all on function public.city_titles(uuid) from public, anon, authenticated;

select cron.schedule('champions-ville', '15 0 1 * *', $$select public.compute_city_champions()$$);

-- Profils : ajout de la clé champions (le reste des fonctions est inchangé)
create or replace function public.get_public_profile(p_pseudo text)
 returns jsonb language sql stable security definer set search_path to '' as $function$
  select jsonb_build_object(
    'pseudo', p.pseudo, 'avatar', p.avatar, 'banner', p.banner, 'points', p.points,
    'level', l.level, 'level_name', l.name, 'member_since', p.created_at,
    'reports_total', (select count(*) from public.reports r where r.user_id = p.id and r.points_awarded > 0),
    'restos_total', (select count(distinct r.establishment_id) from public.reports r where r.user_id = p.id and r.points_awarded > 0),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name) order by b.sort_order)
      from public.user_badges ub join public.badges b on b.code = ub.badge_code
      where ub.user_id = p.id and not public.badge_hidden(ub.badge_code)
    ), '[]'::jsonb),
    'champions', public.city_titles(p.id)
  )
  from public.profiles p
  join lateral (select lv.level, lv.name from public.levels lv where lv.min_points <= p.points order by lv.min_points desc limit 1) l on true
  where p.pseudo = p_pseudo
$function$;

create or replace function public.get_my_profile()
 returns jsonb language sql stable security definer set search_path to '' as $function$
  select jsonb_build_object(
    'pseudo', p.pseudo, 'points', p.points, 'level', l.level, 'level_name', l.name,
    'next_level_at', (select min(x.min_points) from public.levels x where x.min_points > p.points),
    'badges', coalesce((select jsonb_agg(ub.badge_code order by ub.earned_at)
      from public.user_badges ub where ub.user_id = p.id and not public.badge_hidden(ub.badge_code)), '[]'::jsonb),
    'member_since', p.created_at,
    'reports_total', (select count(*) from public.reports r where r.user_id = p.id),
    'reports_30d', (select count(*) from public.reports r where r.user_id = p.id and r.created_at > now() - interval '30 days'),
    'restos_total', (select count(distinct r.establishment_id) from public.reports r where r.user_id = p.id),
    'top_resto', (select e.name from public.reports r join public.establishments e on e.id = r.establishment_id
      where r.user_id = p.id group by e.id, e.name order by count(*) desc, max(r.created_at) desc limit 1),
    'avatar', p.avatar, 'banner', p.banner, 'ref_code', p.ref_code,
    'referrals', (select count(*) from public.profiles f where f.referred_by = p.id and f.referral_rewarded_at is not null),
    'referrals_pending', (select count(*) from public.profiles f where f.referred_by = p.id and f.referral_rewarded_at is null and f.referral_blocked is null),
    'parrain', (select x.pseudo from public.profiles x where x.id = p.referred_by),
    'can_set_referrer', (p.referred_by is null
      and p.created_at > now() - make_interval(days => public.setting('referral_window_days')::int)
      and not exists (select 1 from public.reports r where r.user_id = p.id and r.points_awarded > 0)),
    'champions', public.city_titles(p.id)
  )
  from public.profiles p
  join lateral (select lv.level, lv.name from public.levels lv where lv.min_points <= p.points order by lv.min_points desc limit 1) l on true
  where p.id = auth.uid()
$function$;

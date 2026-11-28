-- 28/11/2026, v239 (demandes d'Alexis)
-- 1) Badges du podium cumulés vers le haut : 3e = bronze ; 2e = argent + bronze ; 1er = or + argent + bronze.
--    (Personne n'a intérêt à finir plus bas pour compléter la collection.) Toujours en attente jusqu'au lancement.
update public.badges set description = 'Finir 1er du classement d''un mois'        where code = 'podium1';
update public.badges set description = 'Finir dans le top 2 du classement d''un mois' where code = 'podium2';
update public.badges set description = 'Finir dans le top 3 du classement d''un mois' where code = 'podium3';

create or replace function public.award_podium_badges(p_month date default null)
returns int language plpgsql security definer set search_path to '' as $$
declare
  m date := coalesce(date_trunc('month', p_month)::date,
                     (date_trunc('month', now() at time zone 'Europe/Paris') - interval '1 month')::date);
  d0 timestamptz := m::timestamp at time zone 'Europe/Paris';
  d1 timestamptz := (m + interval '1 month')::timestamp at time zone 'Europe/Paris';
  n int;
begin
  insert into public.user_badges(user_id, badge_code)
  select x.user_id, 'podium' || b.k
  from (
    select s.user_id, row_number() over (order by s.pts desc, p.pseudo) rk
    from (select r.user_id, sum(r.points_awarded) pts from public.reports r
          where r.user_id is not null and r.created_at >= d0 and r.created_at < d1
          group by r.user_id having sum(r.points_awarded) > 0) s
    join public.profiles p on p.id = s.user_id
  ) x
  join generate_series(1, 3) b(k) on b.k >= x.rk   -- 1er : 1,2,3 · 2e : 2,3 · 3e : 3
  where x.rk <= 3
  order by x.rk, b.k desc                           -- bronze d'abord, l'or en dernier
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.award_podium_badges(date) from public, anon, authenticated;

-- 2) Compte organisateur (app_admins) : toutes les images de profil et tous les rubans utilisables,
--    sans niveau ni badge requis (sans toucher aux points ni aux badges gagnés).
create or replace function public.set_customization(p_kind text, p_code text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare uid uuid := auth.uid(); need integer; badge text; my_level integer;
begin
  if uid is null then return jsonb_build_object('ok', false, 'message', 'Connecte-toi d''abord.'); end if;
  select c.min_level, c.requires_badge into need, badge from public.customizations c
   where c.kind = p_kind and c.code = p_code and c.is_active;
  if need is null then return jsonb_build_object('ok', false, 'message', 'Choix inconnu.'); end if;
  if not public.is_app_admin() then
    if badge is not null and not exists (select 1 from public.user_badges ub where ub.user_id = uid and ub.badge_code = badge) then
      return jsonb_build_object('ok', false, 'message', 'Gagne d''abord ce badge pour l''utiliser.');
    end if;
    select max(l.level) into my_level from public.levels l
     where l.min_points <= (select p.points from public.profiles p where p.id = uid);
    if coalesce(my_level, 1) < need then return jsonb_build_object('ok', false, 'message', format('Débloqué au niveau %s.', need)); end if;
  end if;
  if p_kind = 'avatar' then update public.profiles set avatar = p_code where id = uid;
  else update public.profiles set banner = p_code where id = uid; end if;
  return jsonb_build_object('ok', true);
end; $function$;

-- get_my_profile : + is_admin (l'appli affiche tout débloqué pour l'organisateur ; la base contrôle quand même)
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
    'champions', public.city_titles(p.id),
    'is_admin', public.is_app_admin()
  )
  from public.profiles p
  join lateral (select lv.level, lv.name from public.levels lv where lv.min_points <= p.points order by lv.min_points desc limit 1) l on true
  where p.id = auth.uid()
$function$;

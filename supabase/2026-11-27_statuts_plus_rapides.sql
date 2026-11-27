-- 27/11/2026 : statuts plus rapides (check-up avant les testeurs)
-- Mesure : get_statuses_in_box sur Paris (910 restos) = 2,1 s ; Moselle (87 restos) = 0,3 s.
-- Le temps venait des appels répétés à estimate_votes (2 fois) et popular_level (2 fois)
-- pour chaque resto sans aucun signalement (= presque tous).
-- Changement SANS modifier les règles :
--   1. raccourci : aucun signalement dans la fenêtre la plus large (stale_minutes / estimate_weeks)
--      → on passe directement à la courbe type (même résultat que le chemin complet) ;
--   2. estimate_votes : le nombre de personnes n'est calculé que si le nombre de jours suffit
--      (la condition demande les deux) ;
--   3. popular_level calculé une seule fois.
-- Vérifié avant mise en place : résultats identiques à l'ancienne fonction pour tous les restos
-- visibles, salle et Drive (voir bas du fichier).

create or replace function public.get_service_status(p_establishment uuid, p_service text)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  fresh integer := public.setting('fresh_minutes')::int;
  ratio numeric := public.setting('agree_ratio');
  min_days integer := public.setting('estimate_min_days')::int;
  min_users integer := public.setting('estimate_min_users')::int;
  wait_min_users integer := public.setting('estimate_wait_min_users')::int;
  n integer; total_w numeric; last_age integer; top_level text; top_w numeric; top_n integer; share numeric; rel text; state_value text; wait_value text;
  wait_users integer; wait_total_w numeric; wait_top_users integer; wait_top_w numeric;
  est_days integer; est_users integer; est_level text; est_share numeric; pop_level text;
begin
  if p_establishment is null or p_service is null or p_service not in ('salle', 'drive') then
    return jsonb_build_object('state', 'aucune_info', 'level', null, 'uncertain', false, 'wait', null);
  end if;
  if public.is_open_now(p_establishment) is false then
    return jsonb_build_object('state', 'ferme', 'level', null, 'uncertain', false, 'wait', null);
  end if;
  -- Raccourci : aucun signalement assez récent pour compter (ni actuel, ni habitude).
  if not exists (
    select 1 from public.reports r
    where r.establishment_id = p_establishment and r.service = p_service
      and r.created_at >= now() - greatest(make_interval(mins => public.setting('stale_minutes')::int), make_interval(days => public.setting('estimate_weeks')::int * 7))
  ) then
    pop_level := public.popular_level(p_establishment);
    if pop_level is not null then
      return jsonb_build_object('state', 'theorique', 'level', pop_level, 'uncertain', false, 'wait', null);
    end if;
    return jsonb_build_object('state', 'aucune_info', 'level', null, 'uncertain', false, 'wait', null);
  end if;
  select count(*), coalesce(sum(v.w), 0), coalesce(extract(epoch from now() - max(v.created_at)) / 60, 0)::int
  into n, total_w, last_age from public.recent_votes(p_establishment, p_service) v;
  if n > 0 then
    state_value := case when last_age <= fresh then 'recent' else 'a_confirmer' end;
    select v.level, sum(v.w), count(*) into top_level, top_w, top_n
    from public.recent_votes(p_establishment, p_service) v group by v.level order by sum(v.w) desc, count(*) desc, v.level limit 1;
    share := top_w / nullif(total_w, 0);
    if share < ratio then
      return jsonb_build_object('state', state_value, 'level', null, 'uncertain', true, 'users_total', n, 'users_agree', top_n, 'reliability', 'faible', 'last_report_minutes', last_age, 'wait', null);
    end if;
    rel := case when n = 1 then 'faible' when n = 2 then 'moyenne'
      when n between 3 and 4 then case when share >= 0.75 then 'bonne' else 'moyenne' end
      else case when share >= 0.80 and last_age <= 15 and n >= 5 then 'tres_bonne' when share >= 0.65 then 'bonne' else 'moyenne' end end;
    if last_age > fresh then
      rel := case rel when 'tres_bonne' then 'bonne' when 'bonne' then 'moyenne' else 'faible' end;
    end if;
    select count(*), coalesce(sum(v.w), 0) into wait_users, wait_total_w
    from public.recent_votes(p_establishment, p_service) v where v.level = top_level and v.wait_bucket is not null;
    wait_value := null; wait_top_users := 0; wait_top_w := 0;
    if wait_users >= wait_min_users then
      select v.wait_bucket, count(*), sum(v.w) into wait_value, wait_top_users, wait_top_w
      from public.recent_votes(p_establishment, p_service) v where v.level = top_level and v.wait_bucket is not null
      group by v.wait_bucket order by sum(v.w) desc, count(*) desc, v.wait_bucket limit 1;
      if wait_top_users < wait_min_users or wait_top_w / nullif(wait_total_w, 0) < ratio then wait_value := null; end if;
    end if;
    return jsonb_build_object('state', state_value, 'level', top_level, 'uncertain', false, 'users_total', n, 'users_agree', top_n, 'reliability', rel, 'last_report_minutes', last_age, 'wait', wait_value);
  end if;
  -- Aucun signalement actuel : estimation habituelle (le nombre de personnes n'est compté que si les jours suffisent).
  select count(*) into est_days from public.estimate_votes(p_establishment, p_service);
  if est_days >= min_days then
    select count(distinct u.voter_key) into est_users from public.estimate_votes(p_establishment, p_service) ev cross join lateral unnest(ev.contributor_keys) as u(voter_key);
    if est_users >= min_users then
      select count(*)::numeric / nullif(est_days, 0), ev.level into est_share, est_level
      from public.estimate_votes(p_establishment, p_service) ev group by ev.level order by count(*) desc, ev.level limit 1;
      if est_share >= ratio then
        return jsonb_build_object('state', 'estimation', 'level', est_level, 'estimate_days', est_days, 'estimate_users', est_users, 'wait', public.estimate_wait(p_establishment, p_service, est_level), 'uncertain', false);
      end if;
    end if;
  end if;
  pop_level := public.popular_level(p_establishment);
  if pop_level is not null then
    return jsonb_build_object('state', 'theorique', 'level', pop_level, 'uncertain', false, 'wait', null);
  end if;
  return jsonb_build_object('state', 'aucune_info', 'level', null, 'uncertain', false, 'wait', null);
end;
$function$;

-- Vérification faite le 27/11/2026 au soir (dans une transaction annulée) : 10 faux signalements
-- (récent, à confirmer + Drive, habitude, trop peu de jours, 2 h avant) puis comparaison ancienne /
-- nouvelle fonction sur les 3 716 restos visibles × salle et Drive = 7 432 statuts : 0 différence
-- (états couverts : ferme, recent, a_confirmer, estimation, theorique, aucune_info).

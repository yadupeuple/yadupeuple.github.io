-- 15/11/2026 (Alexis) : le badge « Testeur fondateur » est bien enregistré pendant la phase de test,
-- mais ni visible ni utilisable avant la sortie de l'appli.
-- Réglage : app_settings.beta_badge_visible = 0 (caché) ; au lancement → 1 + réactiver la customization badge_testeur.
insert into public.app_settings(key, value, description) values ('beta_badge_visible', 0, 'Badge Testeur fondateur visible (1) ou caché jusqu''au lancement (0)')
  on conflict (key) do update set value = excluded.value;

create or replace function public.badge_hidden(p_code text)
returns boolean language sql stable set search_path = public, pg_temp as $fn$
  select exists (select 1 from badges b where b.code = p_code and b.kind = 'beta')
     and coalesce((select s.value from app_settings s where s.key = 'beta_badge_visible'), 0) = 0
$fn$;

-- Image de profil « badge testeur » retirée du choix jusqu'au lancement ; avatar remis par défaut.
update public.customizations set is_active = false where code = 'badge_testeur';
update public.profiles set avatar = 'burger' where avatar = 'badge_testeur';

-- award_badges : enregistre toujours, mais ne signale pas les badges cachés (pas de « nouveau badge »).
create or replace function public.award_badges(p_user uuid)
returns text[] language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  c_all integer; c_drive integer; c_est integer; c_city integer; c_ref integer; beta boolean; codes text[];
begin
  select count(*) filter (where r.points_awarded > 0),
         count(*) filter (where r.points_awarded > 0 and r.service = 'drive'),
         count(distinct r.establishment_id) filter (where r.points_awarded > 0)
  into c_all, c_drive, c_est from public.reports r where r.user_id = p_user;
  select count(distinct e.city) into c_city from public.reports r
  join public.establishments e on e.id = r.establishment_id where r.user_id = p_user and r.points_awarded > 0;
  select count(*) into c_ref from public.profiles f where f.referred_by = p_user and f.referral_rewarded_at is not null;
  select coalesce((select s.value = 1 from public.app_settings s where s.key = 'beta_open'), false) into beta;
  with inserted as (
    insert into public.user_badges(user_id, badge_code)
    select p_user, b.code from public.badges b
    where b.is_active and b.kind is not null
      and ((b.kind = 'reports' and c_all >= b.threshold)
        or (b.kind = 'drive_reports' and c_drive >= b.threshold)
        or (b.kind = 'establishments' and c_est >= b.threshold)
        or (b.kind = 'cities' and c_city >= b.threshold)
        or (b.kind = 'referrals' and c_ref >= b.threshold)
        or (b.kind = 'beta' and beta and c_all >= b.threshold))
    on conflict do nothing
    returning badge_code)
  select coalesce(array_agg(badge_code) filter (where not public.badge_hidden(badge_code)), '{}'::text[]) into codes from inserted;
  return codes;
end; $fn$;

-- Pas de points de badge pour un badge caché (ni bonus de catégorie).
create or replace function public.badge_points()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare fam text; n_active integer; n_earned integer;
begin
  if public.badge_hidden(new.badge_code) then return new; end if;
  update public.profiles set points = points + public.setting('badge_points')::int where id = new.user_id;
  select b.family into fam from public.badges b where b.code = new.badge_code;
  select count(*) into n_active from public.badges b where b.family = fam and b.is_active and not public.badge_hidden(b.code);
  select count(*) into n_earned from public.user_badges ub join public.badges b on b.code = ub.badge_code
   where ub.user_id = new.user_id and b.family = fam and b.is_active and not public.badge_hidden(b.code);
  if n_active > 0 and n_earned >= n_active then
    insert into public.badge_family_bonus(user_id, family) values (new.user_id, fam) on conflict do nothing;
    if found then
      update public.profiles set points = points + public.setting('badge_family_bonus')::int where id = new.user_id;
    end if;
  end if;
  return new;
end; $fn$;

-- Lecture : les badges cachés n'apparaissent ni dans la progression, ni dans « mon profil », ni dans le profil public.
-- (ajout d'un filtre « not badge_hidden » dans les fonctions existantes, sans rien changer d'autre)
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_badges_progress'::regproc);
  n := replace(d, 'and ub.user_id = uid', 'and ub.user_id = uid' || chr(10) || '  where not public.badge_hidden(b.code)');
  if n = d then raise exception 'get_badges_progress : motif introuvable'; end if; execute n;

  d := pg_get_functiondef('public.get_my_profile'::regproc);
  n := replace(d, 'from public.user_badges ub where ub.user_id = p.id', 'from public.user_badges ub where ub.user_id = p.id and not public.badge_hidden(ub.badge_code)');
  if n = d then raise exception 'get_my_profile : motif introuvable'; end if; execute n;

  d := pg_get_functiondef('public.get_public_profile'::regproc);
  n := replace(d, 'where ub.user_id = p.id', 'where ub.user_id = p.id and not public.badge_hidden(ub.badge_code)');
  if n = d then raise exception 'get_public_profile : motif introuvable'; end if; execute n;
end $do$;

-- AU LANCEMENT (quand Alexis dit « on lance ») :
--   update app_settings set value = 0 where key = 'beta_open';
--   update app_settings set value = 1 where key = 'beta_badge_visible';
--   update customizations set is_active = true where code = 'badge_testeur';
--   update profiles p set points = points + setting('badge_points')::int
--     from user_badges ub where ub.user_id = p.id and ub.badge_code = 'testeur' and p.pseudo not in ('Maylixela','Testeur1');  -- +1 pt (ces 2 comptes l'ont déjà eu)

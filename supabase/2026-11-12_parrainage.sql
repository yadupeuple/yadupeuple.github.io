-- Y'a du peuple ? — Parrainage
-- Chaque compte a un code d'invitation (lien yadupeuple.github.io/?p=CODE).
-- Le filleul déclare son parrain après inscription (set_referrer), dans les 7 jours.
-- Récompense uniquement au 1er signalement validé du filleul (points > 0, donc sur place) :
--   parrain +20 (max 10 filleuls récompensés sur 30 jours), filleul +10.
-- Badges : 1, 10 et 30 filleuls validés.

-- 1. Colonnes
alter table public.profiles add column if not exists ref_code text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists referral_rewarded_at timestamptz;

update public.profiles
set ref_code = upper(substr(md5(id::text || clock_timestamp()::text), 1, 6))
where ref_code is null;

alter table public.profiles alter column ref_code set default upper(substr(md5(gen_random_uuid()::text), 1, 6));
create unique index if not exists profiles_ref_code_key on public.profiles(ref_code);
create index if not exists profiles_referred_by_idx on public.profiles(referred_by);

insert into public.app_settings(key, value, description) values
  ('referral_points_parrain', 20, 'Points du parrain au 1er signalement validé du filleul'),
  ('referral_points_filleul', 10, 'Points du filleul à son 1er signalement validé'),
  ('referral_max_30d', 10, 'Filleuls récompensés au maximum par parrain sur 30 jours'),
  ('referral_window_days', 7, 'Délai après inscription pour déclarer un parrain (jours)')
on conflict (key) do nothing;

-- 2. Déclarer son parrain
create or replace function public.set_referrer(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  me public.profiles%rowtype;
  ref_id uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated', 'message', 'Connecte-toi d''abord.');
  end if;
  select * into me from public.profiles where id = uid;
  if me.referred_by is not null then
    return jsonb_build_object('ok', false, 'error', 'already', 'message', 'Tu as déjà un parrain.');
  end if;
  select id into ref_id from public.profiles where ref_code = upper(btrim(p_code));
  if ref_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_code', 'message', 'Code de parrainage inconnu.');
  end if;
  if ref_id = uid then
    return jsonb_build_object('ok', false, 'error', 'self', 'message', 'Tu ne peux pas être ton propre parrain.');
  end if;
  if me.created_at < now() - make_interval(days => public.setting('referral_window_days')::int) then
    return jsonb_build_object('ok', false, 'error', 'too_late', 'message', 'Le parrainage n''est possible que pour un compte récent.');
  end if;
  if exists (select 1 from public.reports r where r.user_id = uid and r.points_awarded > 0) then
    return jsonb_build_object('ok', false, 'error', 'too_late', 'message', 'Le parrainage doit être fait avant ton premier signalement.');
  end if;
  update public.profiles set referred_by = ref_id where id = uid;
  return jsonb_build_object('ok', true, 'parrain', (select pseudo from public.profiles where id = ref_id));
end;
$function$;

grant execute on function public.set_referrer(text) to authenticated;

-- 3. Récompense au 1er signalement validé du filleul
create or replace function public.reward_referral()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me public.profiles%rowtype;
  n_recent integer;
begin
  select * into me from public.profiles where id = new.user_id;
  if me.referred_by is null or me.referral_rewarded_at is not null then
    return new;
  end if;
  update public.profiles
     set referral_rewarded_at = now(),
         points = points + public.setting('referral_points_filleul')::int
   where id = me.id;
  select count(*) into n_recent from public.profiles
   where referred_by = me.referred_by and id <> me.id
     and referral_rewarded_at > now() - interval '30 days';
  if n_recent < public.setting('referral_max_30d')::int then
    update public.profiles
       set points = points + public.setting('referral_points_parrain')::int
     where id = me.referred_by;
  end if;
  perform public.award_badges(me.referred_by);
  return new;
end;
$function$;

drop trigger if exists reports_reward_referral on public.reports;
create trigger reports_reward_referral
after insert on public.reports
for each row
when (new.points_awarded > 0 and new.user_id is not null)
execute function public.reward_referral();

-- 4. Badges de parrainage
alter table public.badges drop constraint if exists badges_kind_check;
alter table public.badges add constraint badges_kind_check
  check (kind = any (array['reports', 'drive_reports', 'establishments', 'cities', 'referrals']));
insert into public.badges(code, family, name, description, kind, threshold, is_active, sort_order) values
  ('ref1',  'Parrainage', 'Parrain',                      'Parrainer 1 ami (après son premier signalement)', 'referrals', 1,  true, 14),
  ('ref10', 'Parrainage', 'Ambassadeur',                  'Parrainer 10 amis',                               'referrals', 10, true, 15),
  ('ref30', 'Parrainage', 'Légende du bouche-à-oreille',  'Parrainer 30 amis',                               'referrals', 30, true, 16)
on conflict (code) do update set name = excluded.name, description = excluded.description,
  kind = excluded.kind, threshold = excluded.threshold, is_active = excluded.is_active, sort_order = excluded.sort_order;

create or replace function public.award_badges(p_user uuid)
returns text[]
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c_all integer;
  c_drive integer;
  c_est integer;
  c_city integer;
  c_ref integer;
  codes text[];
begin
  select
    count(*) filter (where r.points_awarded > 0),
    count(*) filter (where r.points_awarded > 0 and r.service = 'drive'),
    count(distinct r.establishment_id) filter (where r.points_awarded > 0)
  into c_all, c_drive, c_est
  from public.reports r
  where r.user_id = p_user;

  select count(distinct e.city) into c_city
  from public.reports r
  join public.establishments e on e.id = r.establishment_id
  where r.user_id = p_user and r.points_awarded > 0;

  select count(*) into c_ref from public.profiles f
  where f.referred_by = p_user and f.referral_rewarded_at is not null;

  with inserted as (
    insert into public.user_badges(user_id, badge_code)
    select p_user, b.code
    from public.badges b
    where b.is_active and b.kind is not null
      and ((b.kind = 'reports' and c_all >= b.threshold)
        or (b.kind = 'drive_reports' and c_drive >= b.threshold)
        or (b.kind = 'establishments' and c_est >= b.threshold)
        or (b.kind = 'cities' and c_city >= b.threshold)
        or (b.kind = 'referrals' and c_ref >= b.threshold))
    on conflict do nothing
    returning badge_code
  )
  select coalesce(array_agg(badge_code), '{}'::text[]) into codes from inserted;

  return codes;
end;
$function$;

create or replace function public.get_badges_progress()
returns table(code text, family text, name text, description text, is_active boolean, earned boolean, earned_at timestamp with time zone, current_value integer, target_value integer)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  c_all integer;
  c_drive integer;
  c_est integer;
  c_city integer;
  c_ref integer;
begin
  if uid is null then
    return;
  end if;

  select
    count(*) filter (where r.points_awarded > 0),
    count(*) filter (where r.points_awarded > 0 and r.service = 'drive'),
    count(distinct r.establishment_id) filter (where r.points_awarded > 0)
  into c_all, c_drive, c_est
  from public.reports r
  where r.user_id = uid;

  select count(distinct e.city) into c_city
  from public.reports r
  join public.establishments e on e.id = r.establishment_id
  where r.user_id = uid and r.points_awarded > 0;

  select count(*) into c_ref from public.profiles f
  where f.referred_by = uid and f.referral_rewarded_at is not null;

  return query
  select b.code, b.family, b.name, b.description, b.is_active,
         (ub.user_id is not null),
         ub.earned_at,
         case when b.is_active then least(
           case b.kind
             when 'reports' then c_all
             when 'drive_reports' then c_drive
             when 'establishments' then c_est
             when 'cities' then c_city
             when 'referrals' then c_ref
           end, b.threshold) end,
         case when b.is_active then b.threshold end
  from public.badges b
  left join public.user_badges ub on ub.badge_code = b.code and ub.user_id = uid
  order by b.sort_order;
end;
$function$;

-- 5. Profil : code, filleuls validés / en attente, parrain
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
    ),
    'ref_code', p.ref_code,
    'referrals', (select count(*) from public.profiles f where f.referred_by = p.id and f.referral_rewarded_at is not null),
    'referrals_pending', (select count(*) from public.profiles f where f.referred_by = p.id and f.referral_rewarded_at is null),
    'parrain', (select x.pseudo from public.profiles x where x.id = p.referred_by),
    'can_set_referrer', (p.referred_by is null
      and p.created_at > now() - make_interval(days => public.setting('referral_window_days')::int)
      and not exists (select 1 from public.reports r where r.user_id = p.id and r.points_awarded > 0))
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

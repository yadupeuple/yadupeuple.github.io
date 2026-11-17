-- 17/11/2026 (demande d'Alexis) : activation des 3 derniers badges, tous en « Fiabilité » :
--   fiable (10 signalements confirmés) · coup_de_feu renommé « Sentinelle » (20 confirmés, remplace l'idée « pic d'affluence ») ·
--   oeil_lynx (50 confirmés). Images : éclair ↔ bouclier inversés (fichiers échangés côté appli).
-- Signalement confirmé = un autre compte a signalé le même resto, même service (salle / Drive), à 30 min près,
-- avec le même niveau ou le niveau voisin (ex. Animé confirmé par Un peu de monde ou Y'a du peuple !).

create or replace function public.level_rank(p_level text) returns int language sql immutable as $$
  select case p_level when 'calme' then 1 when 'modere' then 2 when 'frequente' then 3 when 'tres_frequente' then 4 end
$$;

create or replace function public.confirmed_reports_count(p_user uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.reports r
  where r.user_id = p_user
    and exists (
      select 1 from public.reports o
      where o.establishment_id = r.establishment_id and o.service = r.service
        and o.user_id is not null and o.user_id <> r.user_id
        and o.created_at between r.created_at - interval '30 minutes' and r.created_at + interval '30 minutes'
        and abs(public.level_rank(o.level) - public.level_rank(r.level)) <= 1)
$$;
revoke all on function public.confirmed_reports_count(uuid) from public, anon, authenticated;

-- Badges
alter table public.badges drop constraint badges_kind_check;
alter table public.badges add constraint badges_kind_check
  check (kind = any (array['reports','drive_reports','establishments','cities','referrals','beta','weeks','confirmed']));
update public.badges set sort_order = 1013 where code = 'coup_de_feu';
update public.badges set sort_order = 13 where code = 'fiable';
update public.badges set sort_order = 17 where code = 'coup_de_feu';
update public.badges set family = 'Fiabilité', kind = 'confirmed', threshold = 10, is_active = true,
  description = 'Avoir 10 signalements confirmés par d’autres contributeurs' where code = 'fiable';
update public.badges set family = 'Fiabilité', name = 'Sentinelle', kind = 'confirmed', threshold = 20, is_active = true,
  description = 'Avoir 20 signalements confirmés par d’autres contributeurs' where code = 'coup_de_feu';
update public.badges set family = 'Fiabilité', kind = 'confirmed', threshold = 50, is_active = true,
  description = 'Avoir 50 signalements confirmés par d’autres contributeurs' where code = 'oeil_lynx';
-- même ordre pour les badges utilisés en image de profil
update public.customizations set sort_order = 1113 where code = 'badge_coup_de_feu';
update public.customizations set sort_order = 113 where code = 'badge_fiable';
update public.customizations set sort_order = 117 where code = 'badge_coup_de_feu';

-- award_badges et get_badges_progress : nouveau type 'confirmed'
do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.award_badges(uuid)'::regprocedure), E'\r\n', E'\n');
  d := replace(d, 'c_ref integer; beta boolean;', 'c_ref integer; c_conf integer; beta boolean;');
  d := replace(d, '  select coalesce((select s.value = 1', '  c_conf := public.confirmed_reports_count(p_user);' || E'\n' || '  select coalesce((select s.value = 1');
  d := replace(d, '        or (b.kind = ''referrals'' and c_ref >= b.threshold)', '        or (b.kind = ''referrals'' and c_ref >= b.threshold)' || E'\n' || '        or (b.kind = ''confirmed'' and c_conf >= b.threshold)');
  if position('c_conf >= b.threshold' in d) = 0 then raise exception 'award_badges : remplacement raté'; end if;
  execute d;

  d := replace(pg_get_functiondef('public.get_badges_progress()'::regprocedure), E'\r\n', E'\n');
  d := replace(d, '             when ''referrals'' then c_ref', '             when ''referrals'' then c_ref' || E'\n' || '             when ''confirmed'' then public.confirmed_reports_count(uid)');
  if position('confirmed_reports_count(uid)' in d) = 0 then raise exception 'get_badges_progress : remplacement raté'; end if;
  execute d;
end $$;

-- Quand quelqu'un confirme le signalement d'un autre, ce dernier peut gagner son badge tout de suite
create or replace function public.award_confirmed_badges() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid;
begin
  for u in
    select distinct o.user_id from public.reports o
    where o.establishment_id = new.establishment_id and o.service = new.service
      and o.user_id is not null and o.user_id <> new.user_id
      and o.created_at between new.created_at - interval '30 minutes' and new.created_at + interval '30 minutes'
      and abs(public.level_rank(o.level) - public.level_rank(new.level)) <= 1
  loop
    perform public.award_badges(u);
  end loop;
  return null;
end $$;
revoke all on function public.award_confirmed_badges() from public, anon, authenticated;
drop trigger if exists reports_award_confirmed on public.reports;
create trigger reports_award_confirmed after insert on public.reports
  for each row when (new.user_id is not null) execute function public.award_confirmed_badges();

-- Rattrapage : badges déjà mérités par les signalements existants
select public.award_badges(p.id) from public.profiles p;

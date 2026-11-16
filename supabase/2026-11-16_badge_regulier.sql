-- 16/11/2026 (Alexis) : activation du badge « Régulier » = au moins 1 signalement validé par semaine pendant 4 semaines d'affilée.
-- Nouveau type 'weeks' : plus longue série de semaines consécutives (lundi-dimanche, heure de Paris) avec ≥ 1 signalement validé.
alter table public.badges drop constraint badges_kind_check;
alter table public.badges add constraint badges_kind_check
  check (kind = any (array['reports','drive_reports','establishments','cities','referrals','beta','weeks']));

create or replace function public.report_week_streak(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $fn$
  with w as (
    select distinct date_trunc('week', r.created_at at time zone 'Europe/Paris')::date as wk
    from public.reports r where r.user_id = p_user and r.points_awarded > 0
  ), g as (
    select wk, wk - (row_number() over (order by wk))::int * 7 as grp from w
  )
  select coalesce(max(n), 0)::int from (select count(*) n from g group by grp) s
$fn$;
revoke all on function public.report_week_streak(uuid) from public, anon, authenticated;

update public.badges set kind = 'weeks', threshold = 4, is_active = true where code = 'regulier';

do $do$
declare d text; n text;
begin
  -- award_badges : nouveau cas 'weeks'
  d := pg_get_functiondef('public.award_badges'::regproc);
  n := replace(d, 'or (b.kind = ''beta'' and beta and c_all >= b.threshold))',
       'or (b.kind = ''beta'' and beta and c_all >= b.threshold)' || chr(10) ||
       '        or (b.kind = ''weeks'' and public.report_week_streak(p_user) >= b.threshold))');
  if n = d then raise exception 'award_badges : motif introuvable'; end if; execute n;
  -- get_badges_progress : progression « x / 4 semaines »
  d := pg_get_functiondef('public.get_badges_progress'::regproc);
  n := replace(d, 'when ''referrals'' then c_ref', 'when ''referrals'' then c_ref' || chr(10) || '             when ''weeks'' then public.report_week_streak(uid)');
  if n = d then raise exception 'get_badges_progress : motif introuvable'; end if; execute n;
end $do$;

-- Rattrapage : attribue le badge à ceux qui le méritent déjà
select public.award_badges(p.id) from public.profiles p;

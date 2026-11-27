-- Tableau de bord du test (27/11/2026, demande d'Alexis) : chiffres du test visibles dans l'appli, seulement pour son compte.
-- Sécurité : table app_admins (RLS sans règle = aucun accès direct) ; la fonction vérifie auth.uid() côté base.
-- Pas de clé service_role dans l'appli : l'appli appelle get_admin_dashboard() avec la clé publique + la session du compte.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- Compte « Fondateur » d'Alexis (le même que TEST_ACCOUNTS dans js/app.js)
insert into public.app_admins (user_id) values ('a0c88505-a026-42cd-95e1-cad71c0c196c') on conflict do nothing;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.get_admin_dashboard()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Europe/Paris')::date;
  res json;
begin
  if auth.uid() is null or not public.is_app_admin() then
    return json_build_object('ok', false, 'message', 'Réservé à l''administrateur.');
  end if;
  with days as (select generate_series(d - 20, d, interval '1 day')::date as day),
  r as (select x.*, (x.created_at at time zone 'Europe/Paris')::date as day from public.reports x),
  p as (select x.*, (x.created_at at time zone 'Europe/Paris')::date as day from public.profiles x)
  select json_build_object(
    'ok', true,
    'generated_at', now(),
    'accounts', json_build_object(
      'total', (select count(*) from p),
      'today', (select count(*) from p where p.day = d),
      'week', (select count(*) from p where p.day > d - 7),
      'with_report', (select count(distinct user_id) from r where user_id is not null),
      'active_7d', (select count(distinct user_id) from r where r.day > d - 7 and user_id is not null),
      'testeur_badges', (select count(*) from public.user_badges where badge_code = 'testeur'),
      'referred', (select count(*) from p where referred_by is not null),
      'push_users', (select count(distinct user_id) from public.push_subscriptions),
      'favorites', (select count(*) from public.favorites)
    ),
    'reports', json_build_object(
      'total', (select count(*) from r),
      'today', (select count(*) from r where r.day = d),
      'week', (select count(*) from r where r.day > d - 7),
      'salle_21d', (select count(*) from r where r.day > d - 21 and service = 'salle'),
      'drive_21d', (select count(*) from r where r.day > d - 21 and service = 'drive')
    ),
    'days', (select json_agg(json_build_object('day', x.day,
               'reports', (select count(*) from r where r.day = x.day),
               'signups', (select count(*) from p where p.day = x.day)) order by x.day) from days x),
    'cities', (select coalesce(json_agg(c), '[]'::json) from (
               select coalesce(e.city, '?') as city, count(*) as n from r join public.establishments e on e.id = r.establishment_id
               where r.day > d - 21 group by 1 order by 2 desc limit 5) c),
    'top', (select coalesce(json_agg(t), '[]'::json) from (
               select pr.pseudo, count(*) as n, max(r.created_at) as last_at from r join public.profiles pr on pr.id = r.user_id
               where r.day > d - 21 group by pr.pseudo order by 2 desc, 3 desc limit 10) t),
    'feedback', json_build_object(
      'total', (select count(*) from public.feedback),
      'week', (select count(*) from public.feedback where created_at > now() - interval '7 days'),
      'last', (select coalesce(json_agg(f), '[]'::json) from (
               select fb.created_at, coalesce(pr.pseudo, 'sans compte') as pseudo, fb.message, fb.context
               from public.feedback fb left join public.profiles pr on pr.id = fb.user_id
               order by fb.created_at desc limit 10) f)
    ),
    'errors', json_build_object(
      'rows_24h', (select count(*) from public.app_errors where created_at > now() - interval '24 hours'),
      'hits_24h', (select coalesce(sum(hits), 0) from public.app_errors where created_at > now() - interval '24 hours'),
      'last', (select coalesce(json_agg(x), '[]'::json) from (
               select created_at, message, screen, app_version, hits from public.app_errors order by id desc limit 5) x)
    ),
    'push', json_build_object('sent_7d', (select count(*) from public.push_log where sent_at > now() - interval '7 days'))
  ) into res;
  return res;
end $$;
revoke all on function public.get_admin_dashboard() from public, anon;
grant execute on function public.get_admin_dashboard() to authenticated;

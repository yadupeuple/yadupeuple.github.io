-- 18/11/2026 : alertes « c'est calme » sur les favoris (notifications push web).
-- Rien n'est lisible ni modifiable directement depuis l'appli : tout passe par des fonctions (RPC).
-- Les clés VAPID sont créées par la fonction Edge send-calm-alert et restent dans push_config (jamais dans l'appli ni dans le dépôt).

create table if not exists public.push_config (key text primary key, value text not null);
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create table if not exists public.push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  establishment_id uuid not null,
  sent_at timestamptz not null default now()
);
create index if not exists push_log_user_idx on public.push_log(user_id, sent_at);
alter table public.push_config enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;
revoke all on public.push_config, public.push_subscriptions, public.push_log from anon, authenticated;

insert into public.app_settings(key, value, description) values
  ('push_max_per_day', '3', 'Alertes favoris : maximum de notifications par compte et par jour'),
  ('push_hour_from', '8', 'Alertes favoris : pas de notification avant cette heure (Paris)'),
  ('push_hour_to', '22', 'Alertes favoris : pas de notification à partir de cette heure (Paris)'),
  ('push_quiet_minutes', '60', 'Alertes favoris : pas de nouvelle alerte si le resto était déjà signalé calme depuis moins de X min')
on conflict (key) do nothing;

-- Clé publique (celle de l'appli) : lisible par un compte connecté
create or replace function public.get_push_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select value from public.push_config where key = 'vapid_public'
$$;
revoke all on function public.get_push_public_key() from public, anon;
grant execute on function public.get_push_public_key() to authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth) values (uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = uid, p256dh = excluded.p256dh, auth = excluded.auth;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  delete from public.push_subscriptions where user_id = uid and (p_endpoint is null or endpoint = p_endpoint);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Qui prévenir pour un signalement « calme » ? (réservé à la fonction Edge, via service_role)
-- Règles : favori du resto, abonné, pas l'auteur du signalement, entre 8 h et 22 h (Paris),
-- 1 alerte par resto et par jour, 3 par jour et par compte.
create or replace function public.push_targets(p_report uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; res jsonb;
  max_day int := coalesce((select value::int from public.app_settings where key = 'push_max_per_day'), 3);
  h_from int := coalesce((select value::int from public.app_settings where key = 'push_hour_from'), 8);
  h_to int := coalesce((select value::int from public.app_settings where key = 'push_hour_to'), 22);
  paris_hour int := extract(hour from now() at time zone 'Europe/Paris');
  day_start timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
begin
  select rp.*, e.name, e.brand into r from public.reports rp join public.establishments e on e.id = rp.establishment_id where rp.id = p_report;
  if not found or r.level <> 'calme' then return '[]'::jsonb; end if;
  if paris_hour < h_from or paris_hour >= h_to then return '[]'::jsonb; end if;

  with cibles as (
    select distinct f.user_id from public.favorites f
    where f.establishment_id = r.establishment_id
      and f.user_id is distinct from r.user_id
      and exists (select 1 from public.push_subscriptions s where s.user_id = f.user_id)
      and not exists (select 1 from public.push_log l where l.user_id = f.user_id and l.establishment_id = r.establishment_id and l.sent_at >= day_start)
      and (select count(*) from public.push_log l where l.user_id = f.user_id and l.sent_at >= day_start) < max_day
  ), logged as (
    insert into public.push_log(user_id, establishment_id) select user_id, r.establishment_id from cibles returning user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', s.user_id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'establishment_id', r.establishment_id, 'name', r.name, 'service', r.service)), '[]'::jsonb)
  into res from public.push_subscriptions s where s.user_id in (select user_id from logged);
  return res;
end $$;
revoke all on function public.push_targets(uuid) from public, anon, authenticated;
grant execute on function public.push_targets(uuid) to service_role;

-- À chaque signalement « calme » : on prévient la fonction Edge, sauf si le resto était déjà calme récemment
create or replace function public.reports_push_calm() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  secret text; quiet int := coalesce((select value::int from public.app_settings where key = 'push_quiet_minutes'), 60);
begin
  if new.level <> 'calme' then return new; end if;
  if not exists (select 1 from public.favorites f where f.establishment_id = new.establishment_id) then return new; end if;
  if exists (select 1 from public.reports o where o.establishment_id = new.establishment_id and o.service = new.service
             and o.level = 'calme' and o.id <> new.id and o.created_at >= now() - make_interval(mins => quiet)) then return new; end if;
  select value into secret from public.push_config where key = 'hook_secret';
  if secret is null then return new; end if;
  begin
    perform net.http_post(
      url := 'https://ygekcpnsjbbdgtmlxdce.supabase.co/functions/v1/send-calm-alert',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', secret),
      body := jsonb_build_object('action', 'send', 'report_id', new.id));
  exception when others then null; -- un souci de notification ne doit jamais bloquer un signalement
  end;
  return new;
end $$;
drop trigger if exists reports_push_calm on public.reports;
create trigger reports_push_calm after insert on public.reports for each row execute function public.reports_push_calm();

-- Secret partagé entre la base et la fonction Edge (créé une seule fois, jamais affiché)
insert into public.push_config(key, value) values ('hook_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict (key) do nothing;

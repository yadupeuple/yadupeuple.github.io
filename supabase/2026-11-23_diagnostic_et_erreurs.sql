-- 23/11/2026 : corrections du diagnostic Supabase (advisors) + journal des erreurs de l'appli.

-- 1) Diagnostic
alter function public.level_rank(text) set search_path = public;
revoke execute on function public.reports_push_calm() from public, anon, authenticated;  -- fonction de déclencheur, pas un RPC
create index if not exists customizations_requires_badge_idx on public.customizations(requires_badge);
create index if not exists feedback_user_id_idx on public.feedback(user_id);
alter table public.push_log add column if not exists id bigint generated always as identity;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.push_log'::regclass and contype = 'p') then
    alter table public.push_log add primary key (id);
  end if;
end $$;
-- Non traité volontairement : pg_net dans public (déplacement risqué), index « inutilisés » (peu d'utilisateurs pour l'instant),
-- RPC publics SECURITY DEFINER (voulu : tout passe par les RPC), « Leaked password protection » (réglage du tableau de bord).

-- 2) Journal des erreurs de l'appli (sans donnée personnelle : ni compte, ni position, ni e-mail)
create table if not exists public.app_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null,
  source text,
  line int,
  stack text,
  screen text,
  app_version text,
  ua text,
  hits int not null default 1
);
alter table public.app_errors enable row level security;  -- aucune règle : lecture seulement dans Supabase
revoke all on public.app_errors from anon, authenticated;
create index if not exists app_errors_created_idx on public.app_errors(created_at);

create or replace function public.log_client_error(p_message text, p_source text default null, p_line int default null,
  p_stack text default null, p_screen text default null, p_version text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m text := left(coalesce(p_message, ''), 500);
begin
  if length(m) < 2 then return; end if;
  -- même erreur, même version, dans l'heure : on compte au lieu d'ajouter une ligne
  update app_errors set hits = hits + 1
   where id = (select id from app_errors where message = m and app_version is not distinct from left(p_version, 20)
               and created_at > now() - interval '1 hour' order by id desc limit 1);
  if found then return; end if;
  if (select count(*) from app_errors where created_at > now() - interval '1 day') >= 500 then return; end if;  -- garde-fou
  insert into app_errors(message, source, line, stack, screen, app_version, ua)
  values (m, left(p_source, 300), p_line, left(p_stack, 2000), left(p_screen, 60), left(p_version, 20), left(p_ua, 300));
end $$;
revoke all on function public.log_client_error(text, text, int, text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, int, text, text, text, text) to anon, authenticated;

-- Purge : erreurs de plus de 30 jours
select cron.unschedule('purge-erreurs') where exists (select 1 from cron.job where jobname = 'purge-erreurs');
select cron.schedule('purge-erreurs', '15 3 * * *', $$delete from public.app_errors where created_at < now() - interval '30 days'$$);

-- Lire les erreurs : select created_at, hits, message, screen, app_version, ua from app_errors order by id desc limit 50;

-- 16/11/2026 (accord d'Alexis) : bandeau « Version test » dans Profil et Classement,
-- affiché tant que app_settings.beta_open = 1 (passe à 0 au lancement → bandeau retiré tout seul).
create or replace function public.get_app_flags()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('beta_open', coalesce(public.setting('beta_open'), 0) = 1)
$$;
revoke all on function public.get_app_flags() from public;
grant execute on function public.get_app_flags() to anon, authenticated;

-- 27/11/2026 : bouton « M'envoyer une notification test » (Réglages › Alertes sur tes favoris).
-- La fonction Edge send-calm-alert (action « test ») vérifie le jeton de connexion et n'envoie qu'aux abonnements du compte.
-- Table des tests (5 par 24 h et par compte) : aucun accès depuis l'appli (RLS sans règle), seulement la fonction Edge (service_role).
create table if not exists public.push_tests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists push_tests_user_idx on public.push_tests(user_id, sent_at);
alter table public.push_tests enable row level security;
revoke all on public.push_tests from anon, authenticated;

-- Renforcement sécurité + performance (12/11/2026), d'après les conseillers Supabase.
-- Aucune donnée supprimée : on resserre seulement les droits et on optimise.

-- 1. Vue establishment_cards (ancienne, plus utilisée par l'appli) : droits de l'utilisateur, plus ceux du créateur.
alter view public.establishment_cards set (security_invoker = true);

-- 2. Fonctions avec chemin de recherche fixé (évite qu'on détourne une fonction).
alter function public.lvl_bg(text) set search_path = public, pg_temp;
alter function public.lvl_fg(text) set search_path = public, pg_temp;
alter function public.lvl_label(text) set search_path = public, pg_temp;
alter function public.lvl_plain(text) set search_path = public, pg_temp;
alter function public.theory_level() set search_path = public, pg_temp;
alter function public.calmer_nearby(uuid) set search_path = public, pg_temp;

-- 3. Fonctions de triggers : jamais appelables depuis l'appli.
revoke execute on function public.badge_points() from public, anon, authenticated;
revoke execute on function public.reward_referral() from public, anon, authenticated;

-- 4. Fonctions réservées aux comptes connectés : plus accessibles sans compte.
revoke execute on function public.change_pseudo(text) from public, anon;
revoke execute on function public.set_customization(text, text) from public, anon;
revoke execute on function public.set_referrer(text) from public, anon;
revoke execute on function public.toggle_favorite(uuid) from public, anon;
revoke execute on function public.my_favorites() from public, anon;
grant execute on function public.change_pseudo(text), public.set_customization(text, text), public.set_referrer(text),
  public.toggle_favorite(uuid), public.my_favorites() to authenticated;
-- Ancien classement (remplacé par get_ranking) : plus appelable.
revoke execute on function public.get_leaderboard(text, integer) from public, anon, authenticated;

-- 5. Tables de référence : aucune écriture directe depuis l'appli (la RLS bloquait déjà ; double sécurité).
revoke insert, update, delete on public.customizations, public.opening_hours, public.popular_times, public.partners,
  public.partner_offers, public.partner_stats, public.monthly_prizes, public.badge_family_bonus, public.establishment_cards
  from anon, authenticated;
-- Pseudo : seulement via change_pseudo (qui vérifie l'unicité et renvoie un message clair).
revoke update on public.profiles from anon, authenticated;
drop policy if exists "modifier son pseudo" on public.profiles;

-- 6. Règles de lecture plus rapides : auth.uid() calculé une fois par requête, plus de règles en double sur favorites.
drop policy if exists "lire son profil" on public.profiles;
create policy "lire son profil" on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists fav_select_own on public.favorites;
drop policy if exists fav_insert_own on public.favorites;
drop policy if exists fav_delete_own on public.favorites;
drop policy if exists "lire ses favoris" on public.favorites;
drop policy if exists "ajouter ses favoris" on public.favorites;
drop policy if exists "supprimer ses favoris" on public.favorites;
create policy "lire ses favoris" on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy "ajouter ses favoris" on public.favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy "supprimer ses favoris" on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

-- 7. Index sur les clés étrangères.
create index if not exists favorites_establishment_idx on public.favorites (establishment_id);
create index if not exists monthly_prizes_establishment_idx on public.monthly_prizes (establishment_id);
create index if not exists partners_owner_idx on public.partners (owner_id);
create index if not exists user_badges_badge_code_idx on public.user_badges (badge_code);

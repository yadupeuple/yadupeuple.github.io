-- ============================================================================
-- JOUR DU LANCEMENT : À NE LANCER QUE QUAND ALEXIS DIT « ON LANCE »
-- Ce script EFFACE des données (signalements, badges, points de test) :
-- accord explicite d'Alexis obligatoire au moment de le lancer (CLAUDE.md).
--
-- Préparé le 28/11/2026, d'après les décisions d'Alexis (CLAUDE.md, « Avant le lancement public ») :
-- remise à zéro des signalements et de ce qui en découle, SAUF le badge « Testeur fondateur », gardé à vie.
-- ÉTAT : ESSAYÉ le 28/11/2026 à 4 h 30 (confirmation d'Alexis), étapes 0 à 7 dans une transaction annulée :
-- 22 signalements → 0 ; badges → seul « testeur » (1 compte) ; points [0,0,0,0,172] → [0,0,0,0,11] ;
-- 1 ruban de niveau 5 remis au ruban de départ ; beta_open 0, badge testeur visible, image du badge active ;
-- photo de la base faite (26 tables). Vérifié après : rien de changé. Le jour J, relire quand même le contrôle (étape 8).
--
-- À faire aussi le jour J, hors de ce script :
--   * Supabase, partie Authentication : réactiver la confirmation des e-mails (« Confirm email ») ;
--   * cgu.html : retirer la ligne « version test » ; vérifier que le bandeau 🧪 du Profil a disparu ;
--   * 🧪 Mode test › chrono de démarrage : le retirer ou le garder discret ;
--   * annoncer aux testeurs que leur badge est visible (message « fin de test » de la galerie TikTok).
-- ============================================================================

-- 0. Photo de la base juste avant (pour pouvoir revenir en arrière : backup.restore_day(jour)).
select backup.run();

begin;

-- 1. Signalements de test effacés : classements, habitudes et podium repartent de zéro.
delete from public.reports;

-- 2. Badges : on ne garde que « Testeur fondateur » ; bonus de catégorie recalculés plus bas.
delete from public.user_badges where badge_code <> 'testeur';
delete from public.badge_family_bonus;

-- 3. Parrainages : les liens parrain / filleul restent. La récompense (+20 / +10) sera redonnée
--    au 1er signalement du filleul après le lancement, puisque les points repartent de zéro.
update public.profiles set referral_rewarded_at = null where referral_rewarded_at is not null;

-- 4. Fin de la phase de test, badge testeur révélé, image de profil du badge de nouveau proposée.
update public.app_settings set value = 0 where key = 'beta_open';
update public.app_settings set value = 1 where key = 'beta_badge_visible';
update public.customizations set is_active = true where code = 'badge_testeur';

-- 5. Bonus de catégorie (règle existante : +10 quand tous les badges actifs d'une famille sont gagnés).
--    La famille « Spécial » ne contient que le badge testeur : les testeurs l'ont donc complète.
insert into public.badge_family_bonus(user_id, family, awarded_at)
select ub.user_id, b.family, now()
from public.user_badges ub
join public.badges b on b.code = ub.badge_code and b.is_active
group by ub.user_id, b.family
having count(*) = (select count(*) from public.badges b2 where b2.family = b.family and b2.is_active);

-- 6. Points recalculés : seulement les badges gardés (+1 par badge, +10 par catégorie complète).
--    Un testeur repart donc avec 11 points.
update public.profiles p set points =
    (select count(*) from public.user_badges ub join public.badges b on b.code = ub.badge_code and b.is_active
     where ub.user_id = p.id) * public.setting('badge_points')::int
  + (select count(*) from public.badge_family_bonus f where f.user_id = p.id) * public.setting('badge_family_bonus')::int;

-- 7. Image de profil et ruban qui ne sont plus permis (niveau 1, badges gardés) : ceux de départ.
update public.profiles p set avatar = 'burger'
where not exists (
  select 1 from public.customizations c
  where c.kind = 'avatar' and c.code = p.avatar and c.is_active and c.min_level <= 1
    and (c.requires_badge is null
         or exists (select 1 from public.user_badges ub where ub.user_id = p.id and ub.badge_code = c.requires_badge)));
update public.profiles p set banner = 'ruban_ciel'
where not exists (
  select 1 from public.customizations c
  where c.kind = 'banner' and c.code = p.banner and c.is_active and c.min_level <= 1
    and (c.requires_badge is null
         or exists (select 1 from public.user_badges ub where ub.user_id = p.id and ub.badge_code = c.requires_badge)));

-- 8. Contrôle avant de valider : 0 signalement, seulement des badges testeur, points = 0 ou 11, beta_open = 0.
select
  (select count(*) from public.reports) as signalements,
  (select string_agg(distinct badge_code, ', ') from public.user_badges) as badges_gardes,
  (select string_agg(pseudo || ' = ' || points, ', ' order by pseudo) from public.profiles) as points,
  (select value from public.app_settings where key = 'beta_open') as beta_open,
  (select value from public.app_settings where key = 'beta_badge_visible') as badge_testeur_visible;

-- Si le contrôle est bon :
commit;
-- Sinon, à la place du commit : rollback;

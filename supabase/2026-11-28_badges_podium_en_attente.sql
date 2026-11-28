-- Badges du podium mis en attente jusqu'à la fin de la version test (28/11/2026, demande d'Alexis).
-- Affichés « Bientôt disponible » 🔒 ; plus de calcul automatique le 1er du mois.
update public.badges set is_active = false where kind = 'podium';
select cron.unschedule('badges-podium');

-- Pour les réactiver (fait par LANCEMENT_jour_J.sql) :
--   update public.badges set is_active = true where kind = 'podium';
--   select cron.schedule('badges-podium', '20 0 1 * *', $$select public.award_podium_badges()$$);

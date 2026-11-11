-- Y'a du peuple ? — Drive : afficher le nombre de voitures dès le 1er signalement (pilote)
-- Avant : il fallait 3 personnes d'accord. Après : 1 seule suffit.
-- La règle des 55 % d'accord reste active quand plusieurs personnes signalent.
-- Pour revenir en arrière : remettre la valeur '3'.

update public.app_settings
set value = '1'
where key = 'estimate_wait_min_users';

select key, value from public.app_settings where key = 'estimate_wait_min_users';

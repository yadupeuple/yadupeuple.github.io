-- 17/11/2026 (demande d'Alexis) : nouvelles images des 3 badges « villes » (outils/badges_voyage.py)
-- et nouveaux noms : 3 villes « Tour de la zone » (inchangé), 6 villes « Voyageur », 10 villes « Globe-trotteur ».
update public.badges set name = 'Voyageur' where code = 'tour_zone6';
update public.badges set name = 'Globe-trotteur' where code = 'tour_zone10';

-- 17/11/2026 (suite, demande d'Alexis) : paliers 5, 10 et 20 villes.
update public.badges set threshold = 5,  description = 'Signaler dans 5 villes différentes'  where code = 'tour_zone';
update public.badges set threshold = 10, description = 'Signaler dans 10 villes différentes' where code = 'tour_zone6';
update public.badges set threshold = 20, description = 'Signaler dans 20 villes différentes' where code = 'tour_zone10';

-- tour_zone6 renommé « Baroudeur » (trop proche de « Voyageur international », Alexis 17/11).
update public.badges set name = 'Baroudeur' where code = 'tour_zone6';

-- Échange demandé par Alexis (17/11) : 10 villes = Globe-trotteur (monuments), 20 villes = Baroudeur (avion) ; images échangées aussi.
update public.badges set name = 'Globe-trotteur' where code = 'tour_zone6';
update public.badges set name = 'Baroudeur' where code = 'tour_zone10';

-- 17/11/2026 (demande d'Alexis) : nouvelles images des 3 badges « villes » (outils/badges_voyage.py)
-- et nouveaux noms : 3 villes « Tour de la zone » (inchangé), 6 villes « Voyageur », 10 villes « Globe-trotteur ».
update public.badges set name = 'Voyageur' where code = 'tour_zone6';
update public.badges set name = 'Globe-trotteur' where code = 'tour_zone10';

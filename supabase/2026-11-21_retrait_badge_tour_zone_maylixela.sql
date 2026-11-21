-- 21/11/2026, accord d'Alexis : retrait du badge « Tour de la zone » de Maylixela (gagné le 17/11 avec l'ancienne règle de 3 villes ; palier actuel : 5 villes).
delete from user_badges where badge_code = 'tour_zone' and user_id = (select id from profiles where pseudo = 'Maylixela');

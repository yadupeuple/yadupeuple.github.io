-- 27/11/2026 au soir : test réel des alertes « c'est calme » sur le téléphone d'Alexis (à sa demande).
-- 2 faux signalements « calme » anonymes (user_id null) insérés sur ses favoris pour déclencher l'alerte :
--   McDonald's Linkling (b1c013f2-ed6c-47b4-a5dc-e8078501ab9a, 19 h 38) → sent:1 mais abonnement périmé, rien reçu ;
--   KFC Mondelange (f8d420dc-b375-43cc-a9fa-fe026968f6b0, 19 h 54, après réabonnement) → sent:2.
-- Supprimés ensuite avec l'accord d'Alexis (« Oui ») :
delete from public.reports where id in ('b1c013f2-ed6c-47b4-a5dc-e8078501ab9a','f8d420dc-b375-43cc-a9fa-fe026968f6b0') and user_id is null;
-- (les lignes de push_log, historique des envois, sont gardées)

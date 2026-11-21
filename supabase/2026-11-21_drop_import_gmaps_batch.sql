-- 21/11/2026, accord d'Alexis : suppression de l'ancien outil de relevé en masse des courbes Google (désactivé depuis le 16/11).
drop function if exists public.import_gmaps_batch(text, jsonb);

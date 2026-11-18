-- 18/11/2026 (demande d'Alexis) : badges Fiabilité (fiable, coup_de_feu, oeil_lynx) verrouillés au début
-- (trop peu d'utilisateurs pour se confirmer entre eux). Ils passent dans « Bientôt disponibles » 🔒.
-- Pour les rouvrir : update public.badges set is_active = true where kind = 'confirmed';
update public.badges set is_active = false where kind = 'confirmed';

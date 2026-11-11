// Configuration publique de l'appli.
// Seule la clé PUBLIQUE de Supabase est autorisée ici (jamais la clé service_role).
export const SUPABASE_URL = 'https://ygekcpnsjbbdgtmlxdce.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jreZhBNIOsn-athEC7nOvw_xMawIRSx';

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const DEFAULT_CENTER = [6.15, 49.30]; // [lng, lat] : entre Thionville et Metz
export const DEFAULT_ZOOM = 10.2;

export const CONTACT_EMAIL = 'contact.yadupeuple@gmail.com';

// Trajet estimé : distance à vol d'oiseau × 1,3 à 46 km/h (réglage validé par Alexis).
export const ROUTE_FACTOR = 1.3;
export const ROUTE_SPEED_KMH = 46;

// Rafraîchissement automatique des statuts (ms).
export const REFRESH_MS = 60_000;

// Configuration publique de l'appli.
// Seule la clé PUBLIQUE de Supabase est autorisée ici (jamais la clé service_role).
export const SUPABASE_URL = 'https://ygekcpnsjbbdgtmlxdce.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jreZhBNIOsn-athEC7nOvw_xMawIRSx';

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const DEFAULT_CENTER = [6.15, 49.30]; // [lng, lat] : entre Thionville et Metz
export const DEFAULT_ZOOM = 10.2;

export const CONTACT_EMAIL = 'contact.yadupeuple@gmail.com';

// Trajet estimé (calé sur Google Maps, 13/11/2026) : distance par la route = vol d'oiseau × 1,3 en local,
// jusqu'à × 1,5 au-delà de 100 km ; les 15 premiers km à 46 km/h (ville), le reste à 100 km/h (voie rapide).
export const ROUTE = { factorNear: 1.3, factorFar: 1.5, nearKm: 20, farKm: 100, cityKm: 15, citySpeed: 46, fastSpeed: 100 };

// Rafraîchissement automatique des statuts (ms).
export const REFRESH_MS = 60_000;

// Connexion Google (bouton officiel « Google Identity Services ») : identifiant client public, pas secret.
export const GOOGLE_CLIENT_ID = '493917725058-b20mpb2og4k3m1rrnpqnvceg754j4fvq.apps.googleusercontent.com';

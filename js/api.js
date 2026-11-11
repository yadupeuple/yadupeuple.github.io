// Accès aux données : Supabase en vrai, ou un faux serveur en mode démo (?demo).
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=20';
import { createDemoApi } from './demo.js?v=20';

export const DEMO = window.YDP_DEMO === true || new URLSearchParams(location.search).has('demo');

class ApiError extends Error {}

function frenchAuthError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet e-mail.';
  if (m.includes('password') && (m.includes('6') || m.includes('short') || m.includes('weak'))) return 'Mot de passe trop court ou trop simple (6 caractères minimum).';
  if (m.includes('email') && m.includes('invalid')) return 'Adresse e-mail invalide.';
  if (m.includes('not confirmed')) return 'Confirme ton adresse e-mail (lien reçu par mail) avant de te connecter.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (m.includes('fetch') || m.includes('network')) return 'Pas de connexion internet.';
  return 'Une erreur est survenue. Réessaie.';
}

function createSupabaseApi() {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  async function rpc(name, args = {}) {
    const { data, error } = await sb.rpc(name, args);
    if (error) {
      console.error(name, error);
      throw new ApiError(error.message?.includes('fetch') ? 'Pas de connexion internet.' : 'Le serveur ne répond pas. Réessaie.');
    }
    return data;
  }

  return {
    demo: false,
    async getUser() {
      const { data } = await sb.auth.getSession();
      return data.session?.user ?? null;
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((_e, session) => cb(session?.user ?? null));
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new ApiError(frenchAuthError(error));
      return data.user;
    },
    async signUp(email, password, pseudo) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { pseudo } } });
      if (error) throw new ApiError(frenchAuthError(error));
      if (!data.session) {
        return { user: data.user, needsConfirmation: true };
      }
      return { user: data.user, needsConfirmation: false };
    },
    async signOut() { await sb.auth.signOut(); },

    async listEstablishments() {
      const { data, error } = await sb.from('establishments')
        .select('id,name,brand,city,address,lat,lng,has_dine_in,has_drive')
        .order('name');
      if (error) throw new ApiError('Impossible de charger les restaurants.');
      return data;
    },
    nearby: (lat, lng, radius = 5000, limit = 50) =>
      rpc('get_nearby_establishments', { p_lat: lat, p_lng: lng, p_radius_m: radius, p_limit: limit }),
    search: (q, lat = null, lng = null) =>
      rpc('search_establishments', { p_query: q, p_lat: lat, p_lng: lng, p_limit: 20 }),
    serviceStatus: (id, service) => rpc('get_service_status', { p_establishment: id, p_service: service }),
    history: (id, service) => rpc('get_history', { p_establishment: id, p_service: service, p_limit: 5 }),
    calmerNearby: (id) => rpc('calmer_nearby', { p_id: id }),
    // Courbe d'affluence habituelle (Google Maps) : 168 valeurs, jour 0 = dimanche. null si absente.
    async popularTimes(id) {
      const { data, error } = await sb.from('popular_times').select('profile').eq('establishment_id', id).maybeSingle();
      if (error) return null; // table pas encore créée : on garde la courbe type
      return data?.profile || null;
    },
    leaderboard: (city = null, days = 7) => rpc('get_leaderboard', { p_city: city, p_days: days }),
    submitReport: (r) => rpc('submit_report', {
      p_establishment: r.establishmentId, p_service: r.service, p_level: r.level,
      p_wait: r.wait || null, p_lat: r.lat, p_lng: r.lng, p_accuracy_m: r.accuracy,
    }),
    myProfile: () => rpc('get_my_profile'),
    badgesProgress: () => rpc('get_badges_progress'),
    changePseudo: (p) => rpc('change_pseudo', { new_pseudo: p }),
    toggleFavorite: (id) => rpc('toggle_favorite', { est: id }),
    myFavorites: () => rpc('my_favorites'),
    exportMyData: () => rpc('export_my_data'),
    deleteMyAccount: () => rpc('delete_my_account'),
  };
}

export const api = DEMO ? createDemoApi() : createSupabaseApi();
export { ApiError };

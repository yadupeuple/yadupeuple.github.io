// Faux serveur pour le mode démo (?demo) : aucune donnée réelle n'est lue ni écrite.
import { DEMO_ESTABLISHMENTS } from './demo-data.js?v=11';
import { distanceM, LEVELS, theoryLevelAt, parisNow } from './levels.js?v=11';

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function fakeStatus(id, service) {
  const n = hash(id + service);
  const kind = n % 5;
  if (kind <= 1) {
    const level = LEVELS[n % 4];
    const min = (n >> 3) % 50;
    return {
      state: min <= 30 ? 'recent' : 'a_confirmer', level, uncertain: false,
      users_total: 1 + (n % 5), users_agree: 1 + (n % 3),
      reliability: ['faible', 'moyenne', 'bonne', 'tres_bonne'][n % 4],
      last_report_minutes: min,
      wait: service === 'drive' ? ['c0_2', 'c3_5', 'c6_8', 'c9plus'][LEVELS.indexOf(level)] : null,
    };
  }
  if (kind === 2) return { state: 'recent', level: null, uncertain: true, users_total: 4, users_agree: 2, reliability: 'faible', last_report_minutes: 6, wait: null };
  const { h, dow } = parisNow();
  const lvl = theoryLevelAt(h, dow);
  return lvl ? { state: 'theorique', level: lvl, uncertain: false, wait: null } : { state: 'aucune_info', level: null, uncertain: false, wait: null };
}

function withStatus(e, lat, lng) {
  return {
    ...e,
    distance_m: lat != null ? Math.round(distanceM(lat, lng, e.lat, e.lng)) : null,
    status_salle: e.has_dine_in ? fakeStatus(e.id, 'salle') : null,
    status_drive: e.has_drive ? fakeStatus(e.id, 'drive') : null,
  };
}

export function createDemoApi() {
  let user = null;
  const listeners = [];
  const profile = { pseudo: 'Testeur57', points: 135, level: 2, level_name: 'Curieux', next_level_at: 250, badges: ['v1', 'v10'] };
  const favorites = new Set(['1410c6a8-46d9-4d6c-83f2-c98b8c7a4c42']);
  try { if (localStorage.getItem('ydp_demo_user')) user = { id: 'demo', email: 'demo@exemple.fr' }; } catch {}
  const setUser = (u) => {
    user = u;
    try { u ? localStorage.setItem('ydp_demo_user', '1') : localStorage.removeItem('ydp_demo_user'); } catch {}
    listeners.forEach((cb) => cb(u));
  };

  return {
    demo: true,
    async getUser() { return user; },
    onAuthChange(cb) { listeners.push(cb); },
    async signIn(email) { await wait(); setUser({ id: 'demo', email }); return user; },
    async signUp(email, _pw, pseudo) { await wait(); if (pseudo) profile.pseudo = pseudo; setUser({ id: 'demo', email }); return { user, needsConfirmation: false }; },
    async signOut() { setUser(null); },

    async listEstablishments() { await wait(); return DEMO_ESTABLISHMENTS.map((e) => ({ ...e })); },
    async nearby(lat, lng, radius = 5000, limit = 50) {
      await wait();
      return DEMO_ESTABLISHMENTS.map((e) => withStatus(e, lat, lng))
        .filter((e) => e.distance_m <= radius).sort((a, b) => a.distance_m - b.distance_m).slice(0, limit);
    },
    async search(q, lat, lng) {
      await wait();
      const n = q.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      if (n.trim().length < 2) return [];
      return DEMO_ESTABLISHMENTS.filter((e) => [e.name, e.brand, e.city, e.address].some((x) => norm(x).includes(n)))
        .map((e) => withStatus(e, lat, lng)).slice(0, 20);
    },
    async serviceStatus(id, service) { await wait(); return fakeStatus(id, service); },
    async history(id, service) {
      await wait();
      const s = fakeStatus(id, service);
      if (!s.last_report_minutes && s.state !== 'recent') return [];
      return [0, 1, 2].map((i) => ({ level: LEVELS[(hash(id) + i) % 4], minutes_ago: (s.last_report_minutes || 3) + i * 7 }));
    },
    async calmerNearby(id) {
      await wait();
      const e = DEMO_ESTABLISHMENTS.find((x) => x.id === id);
      const other = DEMO_ESTABLISHMENTS.find((x) => x.city === e?.city && x.id !== id);
      return other ? `Plus calme à côté : ${other.name}` : '';
    },
    async leaderboard() {
      await wait();
      return [
        { rang: 1, pseudo: 'BurgerHunter', points_periode: 120, is_me: false },
        { rang: 2, pseudo: 'Testeur57', points_periode: 85, is_me: !!user },
        { rang: 3, pseudo: 'DriveMaster', points_periode: 40, is_me: false },
      ];
    },
    async submitReport(r) {
      await wait(400);
      if (!user) return { ok: false, error: 'not_authenticated', message: 'Connectez-vous pour envoyer un signalement.' };
      const e = DEMO_ESTABLISHMENTS.find((x) => x.id === r.establishmentId);
      const d = distanceM(r.lat, r.lng, e.lat, e.lng);
      if (d > 100) return { ok: false, error: 'too_far', message: "Vous êtes trop loin de l'établissement pour signaler.", distance_m: Math.round(d), limit_m: 100 };
      profile.points += 10;
      return { ok: true, points: 10, window_pos: 1, new_badges: profile.badges.includes('explorer') ? [] : ['explorer'] };
    },
    async myProfile() { await wait(); return user ? { ...profile } : null; },
    async badgesProgress() {
      await wait();
      if (!user) return [];
      return [
        ['v1', 'Volume', 'Premier signalement', 'Faire 1 signalement ayant rapporté des points', true, 1, 1],
        ['v10', 'Volume', '5 signalements', 'Faire 5 signalements ayant rapporté des points', true, 5, 5],
        ['v50', 'Volume', '10 signalements', 'Faire 10 signalements ayant rapporté des points', false, 7, 10],
        ['drive10', 'Variété', 'Éclaireur du Drive', 'Faire 10 signalements Drive ayant rapporté des points', false, 3, 10],
        ['explorer', 'Variété', 'Explorateur', 'Signaler dans 5 restaurants différents en gagnant des points', false, 4, 5],
        ['coup_de_feu', 'Moments', 'Coup de feu', 'Signaler pendant un pic (12h-13h30 ou 19h-20h30)', null, null, null],
      ].map(([code, family, name, description, earned, cur, target]) => ({
        code, family, name, description, is_active: earned !== null, earned: !!earned, earned_at: null,
        current_value: cur, target_value: target,
      }));
    },
    async changePseudo(p) { await wait(); if (p.length < 3 || p.length > 20) return 'Le pseudo doit faire 3 a 20 caracteres'; profile.pseudo = p; return 'ok'; },
    async toggleFavorite(id) {
      await wait();
      if (!user) return 'Connexion requise';
      if (favorites.has(id)) { favorites.delete(id); return 'Retire des favoris'; }
      favorites.add(id); return 'Ajoute aux favoris';
    },
    async myFavorites() { await wait(); return user ? DEMO_ESTABLISHMENTS.filter((e) => favorites.has(e.id)) : []; },
    async exportMyData() { await wait(); return { profil: { pseudo: profile.pseudo, points: profile.points }, signalements: [] }; },
    async deleteMyAccount() { await wait(); setUser(null); return { ok: true }; },
  };
}

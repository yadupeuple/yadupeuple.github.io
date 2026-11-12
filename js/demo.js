// Faux serveur pour le mode démo (?demo) : aucune donnée réelle n'est lue ni écrite.
import { DEMO_ESTABLISHMENTS } from './demo-data.js?v=49';
import { distanceM, LEVELS, theoryLevelAt, parisNow } from './levels.js?v=49';

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
  const profile = { pseudo: 'Testeur57', points: 135, level: 2, level_name: 'Curieux', next_level_at: 250, badges: ['v1', 'v10'], member_since: '2026-11-06T13:00:00Z', reports_total: 14, reports_30d: 9, restos_total: 4, top_resto: 'McDonald\'s Kinepolis', ref_code: 'AB12CD', referrals: 2, referrals_pending: 1, parrain: null, can_set_referrer: true, avatar: 'burger', banner: 'nuit' };
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
    async setReferrer(code) { await wait(); return code ? { ok: true, parrain: 'Maylixela' } : { ok: false, message: 'Code de parrainage inconnu.' }; },
    async signInWithGoogle() { await wait(); setUser({ id: 'demo', email: 'demo@gmail.com' }); },
    async sendMagicLink() { await wait(); },

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
    async customizations() {
      await wait();
      return [
        ['avatar', 'burger', 'icons/avatars/burger.webp', 1],
        ['avatar', 'frites', 'icons/avatars/frites.webp', 1],
        ['avatar', 'pizza', 'icons/avatars/pizza.webp', 1],
        ['avatar', 'soda', 'icons/avatars/soda.webp', 1],
        ['avatar', 'hotdog', 'icons/avatars/hotdog.webp', 1],
        ['avatar', 'tacos', 'icons/avatars/tacos.webp', 1],
        ['avatar', 'popcorn', 'icons/avatars/popcorn.webp', 5],
        ['avatar', 'donut', 'icons/avatars/donut.webp', 5],
        ['avatar', 'cupcake', 'icons/avatars/cupcake.webp', 10],
        ['avatar', 'coeur', 'icons/avatars/coeur.webp', 10],
        ['avatar', 'etoile', 'icons/avatars/etoile.webp', 15],
        ['avatar', 'voiture', 'icons/avatars/voiture.webp', 15],
        ['avatar', 'chat', 'icons/avatars/chat.webp', 20],
        ['avatar', 'chien', 'icons/avatars/chien.webp', 20],
        ['avatar', 'panda', 'icons/avatars/panda.webp', 25],
        ['avatar', 'renard', 'icons/avatars/renard.webp', 25],
        ['avatar', 'chouette', 'icons/avatars/chouette.webp', 30],
        ['avatar', 'ours', 'icons/avatars/ours.webp', 30],
        ['avatar', 'trefle', 'icons/avatars/trefle.webp', 35],
        ['avatar', 'eclair', 'icons/avatars/eclair.webp', 35],
        ['avatar', 'flamme', 'icons/avatars/flamme.webp', 40],
        ['avatar', 'lunettes', 'icons/avatars/lunettes.webp', 40],
        ['avatar', 'lion', 'icons/avatars/lion.webp', 45],
        ['avatar', 'medaille', 'icons/avatars/medaille.webp', 45],
        ['avatar', 'trophee', 'icons/avatars/trophee.webp', 50],
        ['avatar', 'licorne', 'icons/avatars/licorne.webp', 60],
        ['avatar', 'dragon', 'icons/avatars/dragon.webp', 70],
        ['avatar', 'diamant', 'icons/avatars/diamant.webp', 80],
        ['avatar', 'couronne', 'icons/avatars/couronne.webp', 90],
        ['avatar', 'fusee', 'icons/avatars/fusee.webp', 100],
        ['banner', 'nuit', 'icons/banners/nuit.webp', 1],
        ['banner', 'ciel', 'icons/banners/ciel.webp', 1],
        ['banner', 'plage', 'icons/banners/plage.webp', 5],
        ['banner', 'ville', 'icons/banners/ville.webp', 10],
        ['banner', 'foret', 'icons/banners/foret.webp', 15],
        ['banner', 'confettis', 'icons/banners/confettis.webp', 20],
        ['banner', 'hiver', 'icons/banners/hiver.webp', 25],
        ['banner', 'geometrique', 'icons/banners/geometrique.webp', 30],
        ['banner', 'automne', 'icons/banners/automne.webp', 35],
        ['banner', 'sunset', 'icons/banners/sunset.webp', 40],
        ['banner', 'montagne', 'icons/banners/montagne.webp', 45],
        ['banner', 'vagues', 'icons/banners/vagues.webp', 50],
        ['banner', 'printemps', 'icons/banners/printemps.webp', 60],
        ['banner', 'retro', 'icons/banners/retro.webp', 70],
        ['banner', 'tropical', 'icons/banners/tropical.webp', 80],
        ['banner', 'phare', 'icons/banners/phare.webp', 90],
        ['banner', 'espace', 'icons/banners/espace.webp', 100],
      ].map(([kind, code, value, min_level]) => ({ kind, code, value, min_level }));
    },
    async setCustomization(kind, code) {
      await wait();
      if (kind === 'avatar') profile.avatar = code; else profile.banner = code;
      return { ok: true };
    },
    async openingHours() {
      await wait();
      const out = {};
      for (const e of DEMO_ESTABLISHMENTS) {
        const fri = [[600, 1440]], usual = [[600, 1380]];
        out[e.id] = [usual, usual, usual, usual, usual, fri, fri];
      }
      return out;
    },
    async popularTimes(id) {
      await wait();
      // Courbe fictive : pics à midi et le soir, plus fort le week-end.
      const h0 = hash(id);
      const prof = [];
      for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
        if (h < 10 || h > 22) { prof.push(null); continue; }
        const we = d === 0 || d === 5 || d === 6 ? 1.25 : 1;
        const v = (Math.exp(-((h - 12.5) ** 2) / 1.6) * 70 + Math.exp(-((h - 19.5) ** 2) / 1.8) * 80 + 12 + ((h0 + h) % 9)) * we;
        prof.push(Math.min(100, Math.round(v)));
      }
      return prof;
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
    async ranking(scope) {
      await wait();
      const k = scope === 'all' ? 3 : 1;
      return [
        { rang: 1, pseudo: 'BurgerHunter', points: 120 * k, is_me: false, avatar: 'dragon' },
        { rang: 2, pseudo: 'Testeur57', points: 85 * k, is_me: !!user, avatar: profile.avatar },
        { rang: 3, pseudo: 'DriveMaster', points: 40 * k, is_me: false, avatar: 'voiture' },
      ];
    },
    async publicProfile(pseudo) {
      await wait();
      return { pseudo, avatar: 'dragon', banner: 'espace', points: 1840, level: 32, level_name: 'Expert local',
        member_since: '2026-11-02T10:00:00Z', reports_total: 190, restos_total: 14,
        badges: [{ code: 'v1', name: 'Premier signalement' }, { code: 'v10', name: '5 signalements' }, { code: 'drive10', name: 'Éclaireur du Drive' }, { code: 'ref1', name: 'Parrain' }] };
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
        ['ref1', 'Parrainage', 'Parrain', 'Parrainer 1 ami (après son premier signalement)', true, 1, 1],
        ['ref10', 'Parrainage', 'Ambassadeur', 'Parrainer 10 amis', false, 2, 10],
        ['tour_zone', 'Variété', 'Tour de la zone', 'Signaler dans 3 villes différentes en gagnant des points', false, 1, 3],
        ['fiable', 'Fiabilité', 'Fiable', 'Avoir 10 signalements confirmés', null, null, null],
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

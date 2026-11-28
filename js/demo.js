// Faux serveur pour le mode démo (?demo) : aucune donnée réelle n'est lue ni écrite.
import { DEMO_ESTABLISHMENTS as DEMO_ALL } from './demo-data.js?v=235';
// Comme la base : Buffalo Grill et Flunch cachés (24/11/2026).
const DEMO_ESTABLISHMENTS = DEMO_ALL.filter((e) => !/^(Buffalo Grill|Flunch)$/.test(e.brand));
// Démo envoyée aux futurs partenaires (?demo&resto) : le resto partenaire de démonstration ne porte pas le nom d'un vrai restaurant.
if (new URLSearchParams(location.search).has('resto')) {
  const e = DEMO_ESTABLISHMENTS.find((x) => x.id === '1410c6a8-46d9-4d6c-83f2-c98b8c7a4c42');
  if (e) e.name = 'Votre restaurant (démo)';
}
import { distanceM, LEVELS, theoryLevelAt, parisNow } from './levels.js?v=235';

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
  const demoDraws = {};
  const profile = { pseudo: 'Testeur57', points: 135, level: 2, level_name: 'Curieux', next_level_at: 250, badges: ['v1', 'v10'], member_since: '2026-11-06T13:00:00Z', reports_total: 14, reports_30d: 9, restos_total: 4, top_resto: 'McDonald\'s Kinepolis', ref_code: 'AB12CD', referrals: 2, referrals_pending: 1, parrain: null, can_set_referrer: true, avatar: 'burger', banner: 'ruban_ciel', champions: [{ city: 'Thionville', month: '2026-10-01' }] };
  const favorites = new Set(['1410c6a8-46d9-4d6c-83f2-c98b8c7a4c42']);
  const demoPartner = { id: '1410c6a8-46d9-4d6c-83f2-c98b8c7a4c42', founder: true, tagline: 'Restaurant de démonstration', link_url: 'https://exemple.fr', link_label: 'Voir le menu', phone: '03 82 00 00 00',
    offer: { title: '-10 % sur le menu', details: 'Sur présentation de l\'appli en caisse.', only_when_calm: true, ends_at: new Date(Date.now() + 5 * 3600e3).toISOString() } };
  const demoStats = { views: 214, clicks: 31 };
  try { if (localStorage.getItem('ydp_demo_user')) user = { id: 'demo', email: 'demo@exemple.fr' }; } catch {}
  // Lien de démo pour les futurs partenaires (?demo&resto) : déjà connecté, l'espace restaurateur s'ouvre tout seul.
  if (new URLSearchParams(location.search).has('resto')) user = { id: 'demo', email: 'demo@exemple.fr' };
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
    logError() {},
    async statusesInBox(s, w, n, e) {
      await wait();
      return DEMO_ESTABLISHMENTS.filter((x) => x.lat >= s && x.lat <= n && x.lng >= w && x.lng <= e)
        .map((x) => withStatus(x)).map((x) => ({ id: x.id, status_salle: x.status_salle, status_drive: x.status_drive }));
    },
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
        ['avatar', 'glace', 'icons/avatars/glace.webp', 1],
        ['avatar', 'cafe', 'icons/avatars/cafe.webp', 1],
        ['avatar', 'sandwich', 'icons/avatars/sandwich.webp', 3],
        ['avatar', 'milkshake', 'icons/avatars/milkshake.webp', 3],
        ['avatar', 'popcorn', 'icons/avatars/popcorn.webp', 5],
        ['avatar', 'donut', 'icons/avatars/donut.webp', 5],
        ['avatar', 'pomme', 'icons/avatars/pomme.webp', 8],
        ['avatar', 'patte', 'icons/avatars/patte.webp', 8],
        ['avatar', 'coeur', 'icons/avatars/coeur.webp', 10],
        ['avatar', 'musique', 'icons/avatars/musique.webp', 10],
        ['avatar', 'etoile', 'icons/avatars/etoile.webp', 15],
        ['avatar', 'foot', 'icons/avatars/foot.webp', 15],
        ['avatar', 'basket', 'icons/avatars/basket.webp', 18],
        ['avatar', 'photo', 'icons/avatars/photo.webp', 18],
        ['avatar', 'chat', 'icons/avatars/chat.webp', 20],
        ['avatar', 'chien', 'icons/avatars/chien.webp', 20],
        ['avatar', 'panda', 'icons/avatars/panda.webp', 25],
        ['avatar', 'arbre', 'icons/avatars/arbre.webp', 25],
        ['avatar', 'gamer', 'icons/avatars/gamer.webp', 30],
        ['avatar', 'cadeau', 'icons/avatars/cadeau.webp', 30],
        ['avatar', 'trefle', 'icons/avatars/trefle.webp', 35],
        ['avatar', 'eclair', 'icons/avatars/eclair.webp', 35],
        ['avatar', 'flamme', 'icons/avatars/flamme.webp', 40],
        ['avatar', 'lunettes', 'icons/avatars/lunettes.webp', 40],
        ['avatar', 'alien', 'icons/avatars/alien.webp', 45],
        ['avatar', 'robot', 'icons/avatars/robot.webp', 45],
        ['avatar', 'trophee', 'icons/avatars/trophee.webp', 50],
        ['avatar', 'ninja', 'icons/avatars/ninja.webp', 55],
        ['avatar', 'pirate', 'icons/avatars/pirate.webp', 55],
        ['avatar', 'montagne', 'icons/avatars/montagne.webp', 60],
        ['avatar', 'vacances', 'icons/avatars/vacances.webp', 70],
        ['avatar', 'diamant', 'icons/avatars/diamant.webp', 80],
        ['avatar', 'fusee', 'icons/avatars/fusee.webp', 90],
        ['avatar', 'couronne', 'icons/avatars/couronne.webp', 100],
        ['banner', 'ruban_ciel', 'icons/banners/ruban_ciel.webp', 1],
        ['banner', 'ruban_bonbon', 'icons/banners/ruban_bonbon.webp', 1],
        ['banner', 'ruban_turquoise', 'icons/banners/ruban_turquoise.webp', 1],
        ['banner', 'ruban_orange', 'icons/banners/ruban_orange.webp', 1],
        ['banner', 'ruban_violet', 'icons/banners/ruban_violet.webp', 3],
        ['banner', 'ruban_laurier', 'icons/banners/ruban_laurier.webp', 5],
        ['banner', 'ruban_nuit', 'icons/banners/ruban_nuit.webp', 8],
        ['banner', 'ruban_vache', 'icons/banners/ruban_vache.webp', 10],
        ['banner', 'ruban_damier', 'icons/banners/ruban_damier.webp', 12],
        ['banner', 'ruban_flammes', 'icons/banners/ruban_flammes.webp', 14],
        ['banner', 'ruban_vert', 'icons/banners/ruban_vert.webp', 16],
        ['banner', 'ruban_engrenage', 'icons/banners/ruban_engrenage.webp', 20],
        ['banner', 'ruban_coeur', 'icons/banners/ruban_coeur.webp', 25],
        ['banner', 'ruban_fleurs', 'icons/banners/ruban_fleurs.webp', 30],
        ['banner', 'ruban_flocon', 'icons/banners/ruban_flocon.webp', 40],
        ['banner', 'ruban_etoile_violet', 'icons/banners/ruban_etoile_violet.webp', 50],
        ['banner', 'ruban_diamant', 'icons/banners/ruban_diamant.webp', 70],
        ['banner', 'ruban_etoile_or', 'icons/banners/ruban_etoile_or.webp', 60],
        ['banner', 'ruban_flamme_violet', 'icons/banners/ruban_flamme_violet.webp', 85],
        ['banner', 'ruban_couronne', 'icons/banners/ruban_couronne.webp', 100],
        // badge testeur caché jusqu'au lancement (beta_badge_visible)
        //        ['avatar', 'badge_testeur', 'icons/badges/testeur.webp', 1, 'testeur'],
        ['avatar', 'badge_v1', 'icons/badges/v1.webp', 1, 'v1'],
        ['avatar', 'badge_v10', 'icons/badges/v10.webp', 1, 'v10'],
        ['avatar', 'badge_v50', 'icons/badges/v50.webp', 1, 'v50'],
        ['avatar', 'badge_v100', 'icons/badges/v100.webp', 1, 'v100'],
        ['avatar', 'badge_v250', 'icons/badges/v250.webp', 1, 'v250'],
        ['avatar', 'badge_v500', 'icons/badges/v500.webp', 1, 'v500'],
        ['avatar', 'badge_drive10', 'icons/badges/drive10.webp', 1, 'drive10'],
        ['avatar', 'badge_explorer', 'icons/badges/explorer.webp', 1, 'explorer'],
        ['avatar', 'badge_explorer10', 'icons/badges/explorer10.webp', 1, 'explorer10'],
        ['avatar', 'badge_explorer15', 'icons/badges/explorer15.webp', 1, 'explorer15'],
        ['avatar', 'badge_explorer20', 'icons/badges/explorer20.webp', 1, 'explorer20'],
        ['avatar', 'badge_explorer30', 'icons/badges/explorer30.webp', 1, 'explorer30'],
        ['avatar', 'badge_tour_zone', 'icons/badges/tour_zone.webp', 1, 'tour_zone'],
        ['avatar', 'badge_tour_zone6', 'icons/badges/tour_zone6.webp', 1, 'tour_zone6'],
        ['avatar', 'badge_tour_zone10', 'icons/badges/tour_zone10.webp', 1, 'tour_zone10'],
        ['avatar', 'badge_ref1', 'icons/badges/ref1.webp', 1, 'ref1'],
        ['avatar', 'badge_ref10', 'icons/badges/ref10.webp', 1, 'ref10'],
        ['avatar', 'badge_ref30', 'icons/badges/ref30.webp', 1, 'ref30'],
        ['avatar', 'badge_regulier', 'icons/badges/regulier.webp', 1, 'regulier'],
        ['avatar', 'badge_regulier8', 'icons/badges/regulier8.webp', 1, 'regulier8'],
        ['avatar', 'badge_regulier12', 'icons/badges/regulier12.webp', 1, 'regulier12'],
        ['avatar', 'badge_podium1', 'icons/badges/podium1.webp', 1, 'podium1'],
        ['avatar', 'badge_podium2', 'icons/badges/podium2.webp', 1, 'podium2'],
        ['avatar', 'badge_podium3', 'icons/badges/podium3.webp', 1, 'podium3'],
      ].map(([kind, code, value, min_level, requires_badge = null]) => ({ kind, code, value, min_level, requires_badge }));
    },
    async setCustomization(kind, code) {
      await wait();
      if (code.startsWith('badge_') && !profile.badges.includes(code.slice(6))) return { ok: false, message: "Gagne d'abord ce badge pour l'utiliser." };
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
      return other ? { id: other.id, name: other.name, distance_m: 450, label: `Plus calme à côté : ${other.name}` } : {};
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
        member_since: '2026-11-02T10:00:00Z', reports_total: 190, restos_total: 14, champions: [{ city: 'Metz', month: '2026-10-01' }, { city: 'Woippy', month: '2026-09-01' }],
        badges: [{ code: 'v1', name: 'Premier signalement' }, { code: 'v10', name: '5 signalements' }, { code: 'drive10', name: 'Éclaireur du Drive' }, { code: 'ref1', name: 'Parrain' }] };
    },
    async submitReport(r) {
      await wait(400);
      if (!user) return { ok: false, error: 'not_authenticated', message: 'Connectez-vous pour envoyer un signalement.' };
      const e = DEMO_ESTABLISHMENTS.find((x) => x.id === r.establishmentId);
      const d = distanceM(r.lat, r.lng, e.lat, e.lng);
      if (d > 100) return { ok: false, error: 'too_far', message: "Vous êtes trop loin de l'établissement pour signaler.", distance_m: Math.round(d), limit_m: 100 };
      profile.points += 10;
      const nb = ['explorer', 'v50'].filter((b) => !profile.badges.includes(b));
      profile.badges.push(...nb);
      return { ok: true, points: 10, window_pos: 1, new_badges: nb };
    },
    async myProfile() { await wait(); return user ? { ...profile } : null; },
    async badgesProgress() {
      await wait();
      if (!user) return [];
      return [
        ['v1', 'Volume', 'Premier signalement', 'Faire 1 signalement', true, 1, 1],
        // caché jusqu'au lancement : ['testeur', 'Spécial', 'Testeur fondateur', "A testé l'appli avant son lancement", true, 1, 1],
        ['v10', 'Volume', '5 signalements', 'Faire 5 signalements', true, 5, 5],
        ['v50', 'Volume', '10 signalements', 'Faire 10 signalements', false, 7, 10],
        ['drive10', 'Variété', 'Éclaireur du Drive', 'Faire 10 signalements au Drive', false, 3, 10],
        ['explorer20', 'Variété', 'Habitué du Drive', 'Faire 20 signalements au Drive', false, 3, 20],
        ['explorer', 'Variété', 'Explorateur', 'Signaler dans 5 restaurants différents', false, 4, 5],
        ['ref1', 'Parrainage', 'Parrain', 'Parrainer 1 ami', true, 1, 1],
        ['ref10', 'Parrainage', 'Ambassadeur', 'Parrainer 10 amis', false, 2, 10],
        ['explorer10', 'Variété', 'Gastronome', 'Signaler dans 10 restaurants différents', false, 4, 10],
        ['explorer15', 'Variété', 'Cartographe', 'Signaler dans 15 restaurants différents', false, 4, 15],
        ['explorer30', 'Variété', 'Voyageur international', 'Signaler dans 30 restaurants différents', false, 4, 30],
        ['tour_zone', 'Variété', 'Tour de la zone', 'Signaler dans 5 villes différentes', false, 1, 5],
        ['tour_zone6', 'Variété', 'Baroudeur', 'Signaler dans 10 villes différentes', false, 1, 10],
        ['tour_zone10', 'Variété', 'Globe-trotteur', 'Signaler dans 20 villes différentes', false, 1, 20],
        ['regulier', 'Moments', 'Régulier', 'Faire au moins 1 signalement par semaine pendant 4 semaines', false, 1, 4],
        ['regulier8', 'Moments', 'Fidèle', 'Faire au moins 1 signalement par semaine pendant 8 semaines', false, 1, 8],
        ['regulier12', 'Moments', 'Inarrêtable', 'Faire au moins 1 signalement par semaine pendant 12 semaines', false, 1, 12],
        ['podium1', 'Classement', 'Champion du mois', 'Finir 1er du classement d\'un mois', false, null, 1],
        ['podium2', 'Classement', 'Vice-champion du mois', 'Finir 2e du classement d\'un mois', false, null, 2],
        ['podium3', 'Classement', 'Podium du mois', 'Finir 3e du classement d\'un mois', true, null, 3],
        ['fiable', 'Fiabilité', 'Fiable', 'Avoir 10 signalements confirmés par d’autres contributeurs', false, 3, 10],
        ['coup_de_feu', 'Fiabilité', 'Sentinelle', 'Avoir 20 signalements confirmés par d’autres contributeurs', false, 3, 20],
        ['oeil_lynx', 'Fiabilité', 'Œil de lynx', 'Avoir 50 signalements confirmés par d’autres contributeurs', false, 3, 50],
      ].map(([code, family, name, description, earned, cur, target]) => ({
        code, family, name, description, is_active: earned !== null, earned: !!earned, earned_at: null,
        current_value: cur, target_value: target,
      }));
    },
    async changePseudo(p) { await wait(); if (p.length < 3 || p.length > 20) return 'Le pseudo doit faire 3 a 20 caracteres'; profile.pseudo = p; return 'ok'; },
    async pushPublicKey() { await wait(); return null; },
    async savePushSubscription() { await wait(); return { ok: true }; },
    async deletePushSubscription() { await wait(); return { ok: true }; },
    async toggleFavorite(id) {
      await wait();
      if (!user) return 'Connexion requise';
      if (favorites.has(id)) { favorites.delete(id); return 'Retire des favoris'; }
      favorites.add(id); return 'Ajoute aux favoris';
    },
    // Partenaire fictif (démo) ; ajouter &resto à l'adresse pour voir l'espace du restaurateur.
    // Lot du mois fictif en démo.
    async submitFeedback(m) { await wait(); return (m || '').trim().length < 3 ? { ok: false, message: 'Écris quelques mots 🙂' } : { ok: true, message: 'Merci, ton avis est bien arrivé ! (démo)' }; },
    async appFlags() { return { beta_open: true }; },
    async registerDevice() {},
    async lastMonthPodium() { await wait(50); return [
      { rang: 1, pseudo: 'BurgerHunter', points: 412, avatar: 'dragon', mois: '2026-10' },
      { rang: 2, pseudo: 'DriveMaster', points: 260, avatar: 'voiture', mois: '2026-10' },
      { rang: 3, pseudo: 'Testeur57', points: 185, avatar: 'burger', mois: '2026-10' }]; },
    async monthlyPrize() { await wait(50); return { title: 'Un menu offert', sponsor_name: DEMO_ESTABLISHMENTS.find((x) => x.id === demoPartner.id)?.name || 'Restaurant partenaire', establishment_id: demoPartner.id, winners: 1 }; },
    async partners() { await wait(50); return [demoPartner]; },
    async partnerTrack(_id, kind) { kind === 'view' ? demoStats.views++ : demoStats.clicks++; },
    async pushTest() { await wait(); return { ok: true, sent: 1, message: 'Notification envoyée : elle arrive dans quelques secondes. (démo)' }; },
    async drawWheel(month) {
      await wait(150);
      const m = month;
      const names = [['Mila57', 23], ['Kader_Drive', 17], ['LaFringale', 12], ['Juju', 9], ['Nono57', 7], ['TacosKing', 6], ['Sam', 4], ['Lou.Metz', 3], ['Rayan', 2], ['Clem', 2], ['Yanis', 1], ['Ines', 1]];
      const many = Number(new URLSearchParams(location.search).get('roue')) || 0; // ?demo&roue=60 : simule beaucoup de participants
      for (let i = names.length; i < many; i++) names.push([`Joueur${i + 1}`, 1 + (i * 7) % 9]);
      return { ok: true, month: m, done: demoDraws[m] || null, entries: names.map(([pseudo, tickets]) => ({ pseudo, tickets })) };
    },
    async saveDraw(month, pseudo) {
      await wait(150);
      const now = new Date(), cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      if (month >= cm) return { ok: false, message: "Le mois n'est pas terminé : tirage d'essai seulement." };
      if (demoDraws[month]) return { ok: false, message: 'Le tirage de ce mois est déjà enregistré.' };
      demoDraws[month] = { pseudo, tickets: 1, total_tickets: 87, participants: 12, created_at: new Date().toISOString() };
      return { ok: true, pseudo };
    },
    async adminDashboard() {
      await wait();
      const today = new Date(); const days = [];
      for (let i = 20; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push({ day: d.toISOString().slice(0, 10), reports: i > 13 ? 0 : Math.round(3 + (13 - i) * 1.6 + (i % 3) * 2), signups: i > 13 ? 0 : (i % 4 === 0 ? 5 : 2) }); }
      return { ok: true, generated_at: new Date().toISOString(),
        accounts: { total: 41, today: 3, week: 17, with_report: 29, active_7d: 22, testeur_badges: 29, referred: 6, push_users: 9, favorites: 64 },
        reports: { total: 286, today: 23, week: 158, salle_21d: 171, drive_21d: 115 }, days,
        cities: [{ city: 'Metz', n: 96 }, { city: 'Thionville', n: 71 }, { city: 'Mondelange', n: 30 }, { city: 'Hagondange', n: 22 }, { city: 'Woippy', n: 14 }],
        top: [{ pseudo: 'BurgerHunter', n: 31, last_at: new Date().toISOString() }, { pseudo: 'DriveMaster', n: 24, last_at: new Date().toISOString() }, { pseudo: 'Testeur57', n: 19, last_at: new Date().toISOString() }],
        feedback: { total: 12, week: 5, last: [
          { created_at: new Date().toISOString(), pseudo: 'DriveMaster', message: 'Le bouton Signaler est un peu caché quand la carte est zoomée.', context: 'fiche' },
          { created_at: new Date(Date.now() - 864e5).toISOString(), pseudo: 'Testeur57', message: 'Top l\'appli ! Il manque le Burger King de Woippy.', context: 'reglages' }] },
        errors: { rows_24h: 1, hits_24h: 2, last: [{ created_at: new Date().toISOString(), message: 'TypeError: exemple (démo)', screen: 'carte', app_version: '220', hits: 2 }] },
        push: { sent_7d: 14 },
        goals: { retention: { cohort: 18, reported_ever: 14, active_7d: 7 }, target_pct: 33, zone: 'Thionville-Metz', lunch_target: 15,
          lunch: days.slice(-14).map((x, i) => ({ day: x.day, midi: Math.max(0, Math.round(2 + i * 1.1 + (i % 3))), soir: Math.round(1 + i * 0.6) })) } };
    },
    async myRestaurant() {
      await wait();
      if (!user || !new URLSearchParams(location.search).has('resto')) return null;
      const e = DEMO_ESTABLISHMENTS.find((x) => x.id === demoPartner.id);
      return { ...demoPartner, name: e?.name || 'Mon restaurant', offer: demoPartner.offer ? { ...demoPartner.offer, visible: true } : null,
        views_30d: demoStats.views, clicks_30d: demoStats.clicks, reports_30d: 37, contributors_30d: 12, favorites: 9, busiest: [12, 19, 20] };
    },
    async setPartnerOffer(o) {
      await wait();
      if (!o.title) { demoPartner.offer = null; return { ok: true, message: 'Offre retirée.' }; }
      if (o.title.length < 3) return { ok: false, message: 'Le titre doit faire de 3 à 60 caractères.' };
      demoPartner.offer = { title: o.title, details: o.details || null, only_when_calm: !!o.onlyWhenCalm, ends_at: new Date(Date.now() + (o.hours || 24) * 3600e3).toISOString() };
      return { ok: true, message: 'Offre publiée.' };
    },
    async myFavorites() { await wait(); return user ? DEMO_ESTABLISHMENTS.filter((e) => favorites.has(e.id)) : []; },
    async exportMyData() { await wait(); return { profil: { pseudo: profile.pseudo, points: profile.points }, signalements: [] }; },
    async deleteMyAccount() { await wait(); setUser(null); return { ok: true }; },
  };
}

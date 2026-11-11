// Libellés, couleurs et petites aides d'affichage.
// La base décide des statuts : ici on ne fait que les traduire en français.

export const LEVELS = ['calme', 'modere', 'frequente', 'tres_frequente'];

export const LEVEL_INFO = {
  calme:          { label: 'Calme',            color: '#22C55E', soft: '#DCFCE7', rank: 0 },
  modere:         { label: 'Un peu de monde',  color: '#EAB308', soft: '#FEF9C3', rank: 1 },
  frequente:      { label: 'Animé',            color: '#F97316', soft: '#FFEDD5', rank: 2 },
  tres_frequente: { label: "Y'a du peuple !",  color: '#EF4444', soft: '#FEE2E2', rank: 3 },
};
export const NO_INFO = { label: 'Aucune info', color: '#9CA3AF', soft: '#F3F4F6', rank: -1 };

export const WAIT_INFO = {
  c0_2:   { label: '0 à 2 voitures', short: '0-2' },
  c3_5:   { label: '3 à 5 voitures', short: '3-5' },
  c6_8:   { label: '6 à 8 voitures', short: '6-8' },
  c9plus: { label: '9 voitures ou plus', short: '9+' },
};

export const RELIABILITY = {
  faible: 'faible', moyenne: 'moyenne', bonne: 'bonne', tres_bonne: 'très bonne',
};

export function levelInfo(level) {
  return LEVEL_INFO[level] || NO_INFO;
}

// Statut → { level, info, line, isLive }
export function describeStatus(st) {
  if (!st) return { level: null, info: NO_INFO, line: 'Aucune info pour le moment', isLive: false };
  if (st.uncertain) {
    return {
      level: null,
      info: { ...NO_INFO, label: 'Fréquentation incertaine' },
      line: `Avis partagés (${st.users_total ?? '?'} signalements récents)`,
      isLive: true,
    };
  }
  const info = levelInfo(st.level);
  let line;
  switch (st.state) {
    case 'recent':
      line = `Signalé ${ago(st.last_report_minutes)} · fiabilité ${RELIABILITY[st.reliability] || '?'}`;
      break;
    case 'a_confirmer':
      line = `Signalé ${ago(st.last_report_minutes)} · à confirmer`;
      break;
    case 'estimation':
      line = 'Estimation habituelle à cette heure (non confirmée)';
      break;
    case 'theorique':
      line = 'Habituel à cette heure (pas de signalement récent)';
      break;
    default:
      line = 'Aucune info pour le moment';
  }
  return {
    level: st.level || null,
    info: st.level ? info : NO_INFO,
    line,
    isLive: st.state === 'recent' || st.state === 'a_confirmer',
  };
}

export function ago(min) {
  if (min == null) return 'récemment';
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return `il y a ${h} h`;
}

// Le statut « principal » d'un resto pour la pastille de la carte :
// celui qui a une info en direct d'abord, sinon la salle, sinon le Drive.
export function mainStatus(e) {
  const s = e.has_dine_in ? e.status_salle : null;
  const d = e.has_drive ? e.status_drive : null;
  const live = (x) => x && (x.state === 'recent' || x.state === 'a_confirmer') && !x.uncertain;
  if (live(s) && live(d)) return levelInfo(s.level).rank >= levelInfo(d.level).rank ? s : d;
  if (live(s)) return s;
  if (live(d)) return d;
  return s || d || null;
}

// Nom court de l'enseigne pour les pastilles.
export function brandShort(e) {
  const b = (e.brand || '').toLowerCase();
  if (b.startsWith('mcdo')) return 'McDo';
  if (b.startsWith('burger')) return 'BK';
  if (b === 'kfc') return 'KFC';
  if (b.startsWith('quick')) return 'Quick';
  if (b.startsWith('subway')) return 'Subway';
  if (b.startsWith('buffalo')) return 'Buffalo';
  if (b.startsWith("o'tacos") || b.startsWith('otacos')) return "O'Tacos";
  return (e.brand || e.name || '').slice(0, 8);
}

// Courbe type de la journée, recopiée de la fonction theory_level de la base
// (en attendant de vraies moyennes). Renvoie le niveau pour une heure décimale.
export function theoryLevelAt(h, isoDow) {
  const we = isoDow === 6 || isoDow === 7;
  if (h < 10.5 || h >= 23) return null;
  if (h < 11.5) return 'calme';
  if (h < 12) return 'modere';
  if (h < 14) return we ? 'tres_frequente' : 'frequente';
  if (h < 15) return 'modere';
  if (h < 18.5) return we ? 'modere' : 'calme';
  if (h < 19) return 'modere';
  if (h < 21) return (isoDow === 5 || isoDow === 6) ? 'tres_frequente' : 'frequente';
  if (h < 22) return 'modere';
  return 'calme';
}

export function parisNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const days = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { h: Number(get('hour')) + Number(get('minute')) / 60, dow: days[get('weekday')] };
}

// Meilleur créneau dans les heures qui restent aujourd'hui (pas de 30 min).
export function bestTimeToday() {
  const { h, dow } = parisNow();
  let best = null;
  for (let t = Math.ceil(h * 2) / 2; t < 23; t += 0.5) {
    const lvl = theoryLevelAt(t, dow);
    if (!lvl) continue;
    const r = LEVEL_INFO[lvl].rank;
    if (!best || r < best.rank) best = { t, rank: r, level: lvl };
    if (r === 0) break;
  }
  return best;
}

export function fmtHour(t) {
  const hh = Math.floor(t);
  const mm = Math.round((t - hh) * 60);
  return `${hh}h${mm ? String(mm).padStart(2, '0') : ''}`;
}

export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function fmtDistance(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

// ---------------------------------------------------------------------------
// Courbe d'affluence propre au resto (relevée sur Google Maps)
// profile : 168 valeurs (0-100 % du pic de la semaine), index = jour*24 + heure, jour 0 = dimanche.
// Comme sur Google, les heures 0-4 h d'un jour sont la fin de soirée de ce jour-là.
// Mêmes seuils que la fonction popular_level de la base.
// ---------------------------------------------------------------------------
export function levelFromPercent(v) {
  if (v == null || v <= 0) return null;
  if (v < 25) return 'calme';
  if (v < 50) return 'modere';
  if (v < 75) return 'frequente';
  return 'tres_frequente';
}
// isoDow (1 = lundi … 7 = dimanche) -> jour Google (0 = dimanche)
export const gDay = (isoDow) => isoDow % 7;
// Heures d'une journée dans l'ordre du graphique : 5 h -> 23 h puis 0 h -> 4 h (fin de soirée)
export function dayHours(profile, day) {
  const out = [];
  for (let k = 5; k < 29; k++) {
    const h = k % 24;
    const v = profile[day * 24 + h];
    out.push({ h, k, v: v == null ? null : Number(v) });
  }
  // On coupe les heures sans affluence au début et à la fin
  let a = 0, b = out.length - 1;
  while (a <= b && !(out[a].v > 0)) a++;
  while (b >= a && !(out[b].v > 0)) b--;
  return a > b ? [] : out.slice(a, b + 1);
}
export function bestTimeFromProfile(profile) {
  const { h, dow } = parisNow();
  const day = gDay(h < 5 ? (dow === 1 ? 7 : dow - 1) : dow);
  const nowK = h < 5 ? h + 24 : h;
  let best = null;
  for (const x of dayHours(profile, day)) {
    if (x.k + 1 <= nowK || !(x.v > 0)) continue;
    if (x.k > nowK + 3) break; // conseil utile : seulement dans les 3 prochaines heures
    if (!best || x.v < best.v) best = { t: x.h, v: x.v, level: levelFromPercent(x.v) };
  }
  return best;
}

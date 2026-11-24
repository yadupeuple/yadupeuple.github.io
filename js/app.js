// Y'a du peuple ? — logique de l'appli (carte, fiche, signalement, compte).
import { api, DEMO } from './api.js?v=214';
import {
  MAP_STYLE_URL, DEFAULT_CENTER, DEFAULT_ZOOM, CONTACT_EMAIL, GOOGLE_CLIENT_ID,
  ROUTE, REFRESH_MS,
} from './config.js?v=214';
import {
  LEVELS, LEVEL_INFO, WAIT_INFO, NO_INFO, levelInfo, describeStatus, mainStatus, brandShort,
  theoryLevelAt, parisNow, bestTimeToday, fmtHour, distanceM, fmtDistance, ago,
  levelFromPercent, gDay, dayHours, openDuringHour, bestTimeFromProfile, openState, hoursLines,
  estimateRoute, fmtDuration,
} from './levels.js?v=214';
import { airbnbize, addShieldImage } from './mapstyle.js?v=214';
import { BRAND_PATHS } from './brands.js?v=214';

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------
const state = {
  user: null,
  profile: null,
  establishments: new Map(), // id -> resto (+ status_salle, status_drive)
  markers: new Map(),        // id -> { marker, el }
  favorites: new Set(),
  selectedId: null,
  gps: null,                 // { lat, lng, accuracy }
  sheetView: null,
};

const $ = (sel, root = document) => root.querySelector(sel);

// ---------------------------------------------------------------------------
// Journal des erreurs (23/11/2026) : chaque plantage est envoyé à la base (table app_errors), sans donnée personnelle.
// ---------------------------------------------------------------------------
const IGNORED_ERRORS = /ResizeObserver loop|^Script error\.?$|Load failed|Failed to fetch|NetworkError|AbortError|The user aborted/i;
function reportError(message, extra = {}) {
  const msg = String(message || '').trim();
  if (!msg || IGNORED_ERRORS.test(msg)) return;
  let version = '?'; try { version = APP_VERSION; } catch {} // erreur au tout début du chargement
  api.logError?.(msg, { ...extra, screen: state.sheetView || (document.getElementById('welcome')?.hidden === false ? 'accueil' : 'carte'), version });
}
window.addEventListener('error', (e) => {
  if (!e.message) return; // image ou fichier qui ne charge pas : pas une erreur de code
  reportError(e.message, { source: (e.filename || '').replace(location.origin, ''), line: e.lineno, stack: e.error?.stack });
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  if (r?.name === 'ApiError') return; // erreurs déjà expliquées à l'utilisateur (réseau, serveur)
  reportError(r?.message || String(r), { source: 'promise', stack: r?.stack });
});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

// Mode test (position fictive) : réservé au compte d'Alexis (pseudo Maylixela).
const TEST_ACCOUNTS = ['a0c88505-a026-42cd-95e1-cad71c0c196c'];
const isTester = () => DEMO || TEST_ACCOUNTS.includes(state.user?.id);
function testPosition() {
  if (!isTester()) return null;
  const raw = store.get('ydp_test_pos');
  if (!raw) return null;
  const [lat, lng] = raw.split(',').map((x) => Number(x.trim()));
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, accuracy: 10, test: true } : null;
}
function myPosition() { return testPosition() || state.gps; }

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.dataset.action = /localisation/i.test(msg) ? 'gps' : '';
  t.style.cursor = t.dataset.action ? 'pointer' : '';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------------------------------------------------------------------------
// Carte
// ---------------------------------------------------------------------------
const FALLBACK_STYLE = {
  version: 8, sources: {},
  layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#EEF1F4' } }],
};

const map = new maplibregl.Map({
  container: 'map',
  style: FALLBACK_STYLE,
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  attributionControl: false,
  fadeDuration: 0, // tuiles et noms affichés tout de suite (pas de fondu de 300 ms à chaque zoom)
  maxTileCacheSize: 400,
  dragRotate: false,
  pitchWithRotate: false,
});
map.touchZoomRotate.disableRotation();
// Mentions de la carte (obligatoires) : petit bouton « i » discret en haut à gauche, sous le titre,
// replié par défaut ; un toucher affiche les crédits.
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-left');
const foldAttrib = () => document.querySelectorAll('.maplibregl-ctrl-attrib').forEach((el) => el.classList.remove('maplibregl-compact-show'));
// Chronométrage du démarrage (ms depuis l'ouverture), gardé sur le téléphone : visible dans 🧪 Mode test.
const perf = { t: {}, sw: !!navigator.serviceWorker?.controller, cached: false, welcome: false, saved: false };
const mark = (k) => { if (perf.t[k] == null) perf.t[k] = Math.round(performance.now()); };
function savePerf() {
  if (perf.saved) return; perf.saved = true;
  try {
    const list = JSON.parse(localStorage.getItem('ydp_perf') || '[]');
    list.unshift({ d: Date.now(), t: perf.t, sw: perf.sw, cached: perf.cached, welcome: perf.welcome, demo: DEMO, net: navigator.connection?.effectiveType || '' });
    localStorage.setItem('ydp_perf', JSON.stringify(list.slice(0, 12)));
  } catch {}
}
setTimeout(savePerf, 12000);
map.on('load', () => { mark('style'); foldAttrib(); });
map.once('idle', () => mark('idle'));
map.on('styledata', foldAttrib);
map.on('movestart', foldAttrib);
map.on('styleimagemissing', (e) => { if (e.id === 'ydp-shield') addShieldImage(map); });
if (!(DEMO && new URLSearchParams(location.search).has('nomap'))) {
  map.setStyle(MAP_STYLE_URL, { transformStyle: airbnbize });
}
let styleFailed = false;
map.on('error', (e) => {
  // Fond de carte injoignable : on garde l'appli utilisable sur un fond uni.
  if (!styleFailed && !map.isStyleLoaded()) {
    styleFailed = true;
    console.warn('Fond de carte indisponible', e?.error);
    map.setStyle(FALLBACK_STYLE);
  }
});

// Partenaires : fiche Pro + offre du jour. Ne touche jamais aux statuts d'affluence (la base décide de tout).
const partners = new Map();
const partnerOf = (id) => partners.get(id) || null;
async function loadPartners() {
  try {
    const rows = await api.partners();
    partners.clear();
    for (const r of rows || []) partners.set(r.id, r);
  } catch { /* la carte marche sans les partenaires */ }
}
function offerEnd(iso) {
  const d = new Date(iso), n = new Date();
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  if (d.toDateString() === n.toDateString()) return `jusqu'à ${hm}`;
  return `jusqu'au ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
}
function partnerHtml(e) {
  const p = partnerOf(e.id);
  if (!p) return '';
  const o = p.offer;
  return `<div class="partner-box">
    <div class="pb-head"><span class="pb-badge">⭐ Partenaire${p.founder ? ' fondateur' : ''}</span>${p.tagline ? `<span class="pb-tag">${esc(p.tagline)}</span>` : ''}</div>
    ${o ? `<div class="offer"><div class="offer-t">🎁 ${esc(o.title)}</div>${o.details ? `<div class="offer-d">${esc(o.details)}</div>` : ''}<div class="offer-e">${o.only_when_calm ? 'Offre heures creuses · ' : ''}${offerEnd(o.ends_at)}</div></div>` : ''}
    ${p.link_url || p.phone ? `<div class="pb-actions">
      ${p.link_url ? `<a class="btn btn-dark" data-ptrack href="${esc(p.link_url)}" target="_blank" rel="noopener">${esc(p.link_label || 'Voir le site')}</a>` : ''}
      ${p.phone ? `<a class="btn btn-ghost" data-ptrack href="tel:${esc(p.phone.replace(/\s/g, ''))}">📞 Appeler</a>` : ''}
    </div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// Filtres (bouton entre la loupe et le profil) : enseignes, affluence, Drive. Gardés sur le téléphone.
// ---------------------------------------------------------------------------
const BRANDS = ["McDonald's", 'Burger King', 'KFC', 'Quick', 'Subway', "O'Tacos", 'Starbucks'];
const FILTER_LEVELS = [
  ['calme', LEVEL_INFO.calme], ['modere', LEVEL_INFO.modere], ['frequente', LEVEL_INFO.frequente],
  ['tres_frequente', LEVEL_INFO.tres_frequente],
];
const filters = (() => {
  try {
    const f = JSON.parse(store.get('ydp_filters') || '{}');
    return { brands: new Set(f.brands || []), levels: new Set((f.levels || []).filter((l) => l !== 'aucune')), drive: !!f.drive };
  } catch { return { brands: new Set(), levels: new Set(), drive: false }; }
})();
const filtersActive = () => filters.brands.size > 0 || filters.levels.size > 0 || filters.drive;
function saveFilters() {
  store.set('ydp_filters', JSON.stringify({ brands: [...filters.brands], levels: [...filters.levels], drive: filters.drive }));
  const n = filters.brands.size + filters.levels.size + (filters.drive ? 1 : 0);
  const badge = $('#filter-badge');
  if (badge) { badge.hidden = !n; badge.textContent = n; }
  $('#btn-filter')?.classList.toggle('on', n > 0);
}
// Niveau affiché pour le resto (même règle que la pastille : fermé ou sans info = « aucune »).
function levelKey(e) {
  const os = openState(state.hours?.[e.id]);
  if (os && !os.open) return 'aucune';
  return describeStatus(mainStatus(e)).level || 'aucune';
}
function passesFilter(e) {
  if (filters.brands.size && !filters.brands.has(e.brand)) return false;
  if (filters.drive && !e.has_drive) return false;
  if (filters.levels.size && !filters.levels.has(levelKey(e))) return false;
  return true;
}
// Sans GPS : la carte s'ouvre sur le dernier endroit regardé (France entière la 1re fois).
const FRANCE = [[-5.2, 41.3], [9.6, 51.1]];
function savedView() { try { return JSON.parse(localStorage.getItem('ydp_view') || 'null'); } catch { return null; } }
function rememberZone() {
  if (map.getZoom() < 9) return;
  const c = map.getCenter();
  try { localStorage.setItem('ydp_view', JSON.stringify({ lng: +c.lng.toFixed(4), lat: +c.lat.toFixed(4), zoom: +map.getZoom().toFixed(1) })); } catch {}
}
function zonePicker() {
  const el = $('#zone-pick');
  el.innerHTML = `<span>Tous les fast-foods de France sont là.</span><button type="button" data-find="1">🔍 Ma ville</button><button type="button" class="zp-x" aria-label="Fermer">✕</button>`;
  el.hidden = false;
  el.querySelector('[data-find]').onclick = () => { el.hidden = true; $('#btn-search').click(); };
  el.querySelector('.zp-x').onclick = () => { el.hidden = true; };
  setTimeout(() => { el.hidden = true; }, 12000);
}

function openFilters() {
  const brands = [...new Set([...BRANDS, ...[...state.establishments.values()].map((e) => e.brand).filter(Boolean)])];
  const count = () => [...state.establishments.values()].filter(passesFilter).length;
  const draw = () => {
    openSheet('filters', `
      <div class="sheet-head">
        <div class="grow"><h2>Filtrer</h2><div class="sub">Choisis ce que tu veux voir sur la carte</div></div>
        <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
      </div>
      <div class="section-title">Affluence</div>
      <div class="fchips">${FILTER_LEVELS.map(([k, i]) => `<button type="button" class="fchip ${filters.levels.has(k) ? 'on' : ''}" data-level="${k}"><span class="dot" style="background:${i.color}"></span>${esc(i.label)}</button>`).join('')}</div>
      <div class="section-title">Enseignes</div>
      <div class="fchips">${brands.map((b) => `<button type="button" class="fchip ${filters.brands.has(b) ? 'on' : ''}" data-brand="${esc(b)}">${esc(b)}</button>`).join('')}</div>
      <div class="section-title">Service</div>
      <div class="fchips"><button type="button" class="fchip ${filters.drive ? 'on' : ''}" data-drive="1"><span class="emo">🚗</span>Avec Drive</button></div>
      <div class="filter-actions ${filtersActive() ? '' : 'single'}">
        ${filtersActive() ? '<button type="button" class="btn btn-ghost" id="btn-freset">Effacer</button>' : ''}
        <button type="button" class="btn btn-primary" id="btn-fok">Voir ${count()} resto${count() > 1 ? 's' : ''}</button>
      </div>`);
    const keep = $('#sheet-body').scrollTop;
    $('#btn-close').onclick = closeSheet;
    $('#btn-fok').onclick = closeSheet;
    if ($('#btn-freset')) $('#btn-freset').onclick = () => { filters.brands.clear(); filters.levels.clear(); filters.drive = false; apply(); };
    document.querySelectorAll('#sheet-body .fchip').forEach((b) => b.onclick = () => {
      if (b.dataset.level) filters.levels.has(b.dataset.level) ? filters.levels.delete(b.dataset.level) : filters.levels.add(b.dataset.level);
      else if (b.dataset.brand) filters.brands.has(b.dataset.brand) ? filters.brands.delete(b.dataset.brand) : filters.brands.add(b.dataset.brand);
      else filters.drive = !filters.drive;
      apply();
    });
    return keep;
  };
  const apply = () => {
    const y = $('#sheet-body').scrollTop;
    saveFilters(); renderMarkers(); renderCards(); draw();
    $('#sheet-body').scrollTop = y;
  };
  draw();
}

function pillHtml(e) {
  // Une seule pastille : la couleur du service le plus chargé (salle ou Drive), détail dans la fiche.
  const os = openState(state.hours?.[e.id]);
  if (os && !os.open) return `<span class="dot" style="background:#9CA3AF"></span>${esc(brandShort(e))}`;
  const d = describeStatus(mainStatus(e));
  const live = d.isLive ? ' live' : '';
  return `<span class="dot${live}" style="background:${d.info.color};color:${d.info.color}"></span>${esc(brandShort(e))}${partnerOf(e.id)?.offer ? '<span class="gift" title="Offre du jour">🎁</span>' : ''}`;
}

// Pastilles : seuls les restos visibles à l'écran ont une pastille (France entière = plusieurs milliers de restos).
function makeMarker(e) {
  const el = document.createElement('button');
  el.className = 'pill';
  el.type = 'button';
  el.setAttribute('aria-label', e.name);
  el.addEventListener('click', (ev) => { ev.stopPropagation(); openDetail(e.id); });
  const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([e.lng, e.lat]);
  const m = { marker, el, onMap: false };
  state.markers.set(e.id, m);
  return m;
}
function paintMarker(e, m) {
  m.el.innerHTML = pillHtml(e);
  const os = openState(state.hours?.[e.id]);
  m.el.classList.toggle('closed', !!(os && !os.open));
  m.el.classList.toggle('selected', state.selectedId === e.id);
  m.el.classList.toggle('focus', focusId === e.id);
  m.painted = true;
}
function renderMarkers() {
  for (const [id, m] of state.markers) m.painted = false;
  updateClusters();
}

// ---------------------------------------------------------------------------
// Regroupement des pastilles trop proches (« 3 restos »), par grille : rapide même avec des milliers de restos
// ---------------------------------------------------------------------------
const CLUSTER_PX = 46;
let markersOn = false;
// Pendant la plongée de l'animation d'entrée : les restos apparaissent au fil du zoom (rafraîchi 4 fois / s max)
let zoomTick = 0;
let introZoom = false; // vrai seulement pendant la plongée d'entrée
map.on('zoom', () => {
  if (!introZoom || !markersOn || map.getZoom() < 7.5) return;
  const t = Date.now(); if (t - zoomTick < 250) return; zoomTick = t; updateClusters();
});
const clusterMarkers = [];
let focusId = null; // resto mis en avant par la liste du bas
const clusterCache = new Map(); // groupes déjà dessinés, réutilisés tant qu'ils ne changent pas (zoom plus fluide)
function updateClusters() {
  const prevClusters = new Map(clusterCache); clusterCache.clear();
  clusterMarkers.length = 0;
  // Grille fixée sur la carte (coordonnées du monde, pas de l'écran) : déplacer la carte sans zoomer ne change pas les groupes.
  const b = map.getBounds();
  const padLng = (b.getEast() - b.getWest()) * 1.5, padLat = (b.getNorth() - b.getSouth()) * 1.5;
  const W = b.getWest() - padLng, E = b.getEast() + padLng, S = b.getSouth() - padLat, N = b.getNorth() + padLat;
  const cell = map.getZoom() < 9 ? CLUSTER_PX * 1.6 : CLUSTER_PX;
  const ws = 512 * Math.pow(2, map.getZoom());
  const wx = (lng) => (lng + 180) / 360 * ws;
  const wy = (lat) => { const r = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + r) / (1 - r)) / (4 * Math.PI)) * ws; };
  const cells = new Map();
  // Restos affichés seulement une fois l'animation d'entrée lancée vers la position (sinon l'écran se remplit d'un coup)
  if (!markersOn) { for (const c of prevClusters.values()) c.remove(); for (const [, m] of state.markers) if (m.onMap) { m.marker.remove(); m.onMap = false; } return; }
  for (const e of state.establishments.values()) {
    if (e.lng < W || e.lng > E || e.lat < S || e.lat > N || !passesFilter(e)) continue;
    const x = wx(e.lng), y = wy(e.lat);
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), k = cx + ':' + cy;
    let g = cells.get(k);
    if (!g) cells.set(k, g = { m: [], sx: 0, sy: 0, cx, cy, k });
    g.m.push(e); g.sx += x; g.sy += y;
  }
  // Fusion des groupes voisins trop proches (ordre fixe : le plus gros d'abord, puis la case)
  const groups = [...cells.values()];
  groups.forEach((g) => { g.x = g.sx / g.m.length; g.y = g.sy / g.m.length; });
  groups.sort((g1, g2) => g2.m.length - g1.m.length || (g1.k < g2.k ? -1 : 1));
  for (const a of groups) {
    if (a.dead) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const g = cells.get((a.cx + dx) + ':' + (a.cy + dy));
      if (!g || g.dead || g === a || g.m.length > a.m.length || (g.m.length === a.m.length && g.k < a.k)) continue;
      if (Math.hypot(a.x - g.x, a.y - g.y) >= cell) continue;
      const n = a.m.length + g.m.length;
      a.x = (a.x * a.m.length + g.x * g.m.length) / n; a.y = (a.y * a.m.length + g.y * g.m.length) / n;
      a.m = a.m.concat(g.m);
      g.dead = true;
    }
  }
  const shown = new Set();
  for (const members of groups.filter((g) => !g.dead).map((g) => g.m)) {
    if (members.length === 1) {
      const e = members[0];
      const m = state.markers.get(e.id) || makeMarker(e);
      if (!m.painted) paintMarker(e, m);
      if (!m.onMap) { m.marker.addTo(map); m.onMap = true; }
      m.el.style.display = '';
      shown.add(e.id);
      continue;
    }
    const lng = members.reduce((t, e) => t + e.lng, 0) / members.length;
    const lat = members.reduce((t, e) => t + e.lat, 0) / members.length;
    // couleur = resto le plus chargé du groupe
    let worst = describeStatus(mainStatus(members[0])).info;
    for (const e of members) { const i = describeStatus(mainStatus(e)).info; if (i.rank > worst.rank) worst = i; }
    const ckey = members.map((m) => m.id).sort().join(',') + '|' + worst.color + '|' + (members.some((m) => m.id === focusId) ? 'f' : '');
    const old = prevClusters.get(ckey);
    if (old) { prevClusters.delete(ckey); old.setLngLat([lng, lat]); clusterCache.set(ckey, old); clusterMarkers.push(old); continue; }
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pill cluster' + (members.some((m) => m.id === focusId) ? ' focus' : '');
    el.dataset.ids = members.map((m) => m.id).join(',');
    el.setAttribute('aria-label', `${members.length} restaurants`);
    el.innerHTML = `<span class="dot" style="background:${worst.color}"></span>${members.length}`;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); openCluster(members); });
    const cm = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
    clusterCache.set(ckey, cm); clusterMarkers.push(cm);
  }
  for (const c of prevClusters.values()) c.remove();
  // Les pastilles hors écran ou regroupées sont retirées de la carte (moins d'éléments = carte fluide)
  for (const [id, m] of state.markers) {
    if (!shown.has(id) && m.onMap) { m.marker.remove(); m.onMap = false; }
  }
  applyZoomClass();
}
// Tout le travail lourd (pastilles, liste du bas, statuts) attend que la carte soit immobile 250 ms :
// pendant une suite de glissements / zooms, plus aucun calcul ne vient couper l'élan de la carte (saccades).
let mapMoving = false, settleTimer = null, cardsSettle = true, pendingPaint = false;
map.on('movestart', () => { mapMoving = true; clearTimeout(settleTimer); });
map.on('moveend', () => {
  mapMoving = false;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    if (mapMoving) return;
    updateClusters(); rememberZone();
    if (cardsSettle) renderCards(); cardsSettle = true;
    if (pendingPaint) { pendingPaint = false; renderMarkers(); }
    refreshStatuses();
  }, 250);
});

function openCluster(members) {
  const b = new maplibregl.LngLatBounds();
  members.forEach((e) => b.extend([e.lng, e.lat]));
  // Zoom modéré : juste assez pour séparer le groupe, en gardant les restos voisins visibles.
  const cam = map.cameraForBounds(b, { padding: { top: 140, bottom: 220, left: 110, right: 110 } });
  if (cam && cam.zoom > map.getZoom() + 0.6 && map.getZoom() < 16) {
    const z = Math.min(cam.zoom - 0.4, map.getZoom() + 2, 15.5);
    map.easeTo({ center: cam.center, zoom: Math.max(z, map.getZoom() + 0.7), duration: 450 });
    return;
  }
  openSheet('cluster', `
    <div class="sheet-head">
      <div class="grow"><h2>${members.length} restaurants ici</h2></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <ul class="list" id="cluster-list">${members.map((r) => {
      const st = describeStatus(mainStatus(r));
      return `<li data-id="${r.id}" style="cursor:pointer">
        <span class="badge-ico" style="background:${st.info.soft}"><span class="dot" style="width:12px;height:12px;border-radius:50%;background:${st.info.color}"></span></span>
        <div class="grow"><div class="t">${esc(r.name)}</div><div class="s">${esc(r.city || '')} · ${esc(st.info.label)}</div></div>
      </li>`;
    }).join('')}</ul>`);
  $('#btn-close').onclick = closeSheet;
  $('#cluster-list').querySelectorAll('li[data-id]').forEach((li) => li.onclick = () => openDetail(li.dataset.id));
}

// Pastilles réduites à un point quand on dézoome : une seule classe sur la carte, changée seulement au passage du seuil
// (avant : chaque pastille retouchée à chaque image du zoom → saccades).
let zoomCompact = null;
function applyZoomClass() {
  const compact = map.getZoom() < 11.5;
  if (compact === zoomCompact) return;
  zoomCompact = compact;
  map.getContainer().classList.toggle('map-compact', compact);
}
map.on('zoom', applyZoomClass);

let meMarker = null;
function renderMe() {
  const p = myPosition();
  if (!p) { meMarker?.remove(); meMarker = null; return; }
  if (!meMarker) {
    const el = document.createElement('div');
    el.className = 'me-dot';
    meMarker = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
  } else {
    meMarker.setLngLat([p.lng, p.lat]);
  }
}

// ---------------------------------------------------------------------------
// Données : restos + statuts
// ---------------------------------------------------------------------------
// Liste des restos gardée sur le téléphone (24 h) : à l'ouverture suivante la carte s'affiche tout de suite,
// puis la liste est remise à jour en arrière-plan.
const EST_CACHE = 'ydp_est_cache_v2';
const EST_FIELDS = ['id', 'name', 'brand', 'city', 'address', 'lat', 'lng', 'has_dine_in', 'has_drive'];
function cachedEstablishments() {
  if (DEMO) return false;
  try {
    const c = JSON.parse(localStorage.getItem(EST_CACHE) || 'null');
    if (!c || Date.now() - c.t > 24 * 3600e3 || !Array.isArray(c.rows)) return false;
    for (const a of c.rows) { const r = {}; EST_FIELDS.forEach((f, i) => { r[f] = a[i]; }); state.establishments.set(r.id, r); }
    if (c.hours) state.hours = c.hours;
    return state.establishments.size > 0;
  } catch { return false; }
}
async function loadEstablishments() {
  const [rows, hours] = await Promise.all([
    api.listEstablishments(),
    api.openingHours ? api.openingHours().catch(() => ({})) : {},
  ]);
  state.hours = hours || {};
  const ids = new Set(rows.map((r) => r.id));
  for (const id of [...state.establishments.keys()]) if (!ids.has(id)) { state.markers.get(id)?.marker.remove(); state.markers.delete(id); state.establishments.delete(id); }
  for (const r of rows) state.establishments.set(r.id, { ...state.establishments.get(r.id), ...r });
  if (!DEMO) try { localStorage.setItem(EST_CACHE, JSON.stringify({ t: Date.now(), rows: rows.map((r) => EST_FIELDS.map((f) => r[f])), hours: state.hours })); } catch {}
  renderMarkers();
  renderCards();
}

// Statuts : un seul appel par zone (get_statuses_in_box, 2° × 3° max, la base décide).
// On charge la zone affichée élargie, et on précharge autour de l'utilisateur dès l'ouverture :
// en dézoomant, les pastilles ont déjà leur couleur (plus de gris en attendant).
const BOX_MAX = { lat: 2, lng: 3 };
const loadedBoxes = []; // { s, w, n, e, t }
function viewBox() {
  if (map.getZoom() < 7) return null;
  const b = map.getBounds(); const c = map.getCenter();
  const dl = Math.min((b.getNorth() - b.getSouth()) / 2 * 1.4, BOX_MAX.lat / 2);
  const dg = Math.min((b.getEast() - b.getWest()) / 2 * 1.4, BOX_MAX.lng / 2);
  return { s: c.lat - dl, n: c.lat + dl, w: c.lng - dg, e: c.lng + dg };
}
function aroundBox(lat, lng) { return { s: lat - 0.6, n: lat + 0.6, w: lng - 0.9, e: lng + 0.9 }; }
function boxCovered(x) {
  const now = Date.now();
  return loadedBoxes.some((b) => now - b.t < REFRESH_MS && b.s <= x.s && b.n >= x.n && b.w <= x.w && b.e >= x.e);
}
let statusTimer;

const inflight = new Set();
async function loadBox(x) {
  const key = [x.s, x.w, x.n, x.e].map((v) => v.toFixed(2)).join(',');
  if (inflight.has(key)) return;
  inflight.add(key);
  try {
    const rows = await api.statusesInBox(x.s, x.w, x.n, x.e).catch(() => null);
    if (!rows) return;
    for (const row of rows) {
      const e = state.establishments.get(row.id);
      if (e) { e.status_salle = row.status_salle; e.status_drive = row.status_drive; }
    }
    loadedBoxes.push({ ...x, t: Date.now() });
    while (loadedBoxes.length > 12) loadedBoxes.shift();
    if (mapMoving) pendingPaint = true; // on repeindra une fois la carte posée
    else { renderMarkers(); renderCards(); }
    if (state.sheetView === 'detail' && state.selectedId) renderDetail(state.selectedId);
  } finally {
    inflight.delete(key);
  }
}
// Précharge autour de la position (ou du dernier endroit regardé) avant même la plongée d'entrée.
function preloadAround(lat, lng) { const x = aroundBox(lat, lng); if (!boxCovered(x)) loadBox(x); }
async function refreshStatuses(force = false) {
  if (!state.establishments.size) return;
  const x = viewBox();
  const sel = state.selectedId && state.establishments.get(state.selectedId);
  const jobs = [loadPartners()];
  if (x && (force || !boxCovered(x))) jobs.push(loadBox(x));
  else if (!x && sel) jobs.push(loadBox(aroundBox(sel.lat, sel.lng)));
  await Promise.all(jobs);
}

// ---------------------------------------------------------------------------
// Cartes du bas (restos proches)
// ---------------------------------------------------------------------------
function refPoint() {
  const p = myPosition();
  if (p) return p;
  const c = map.getCenter();
  return { lat: c.lat, lng: c.lng };
}

function chipHtml(label, st) {
  const d = describeStatus(st);
  return `<span class="chip"><span class="dot" style="background:${d.info.color}"></span>${label} · ${esc(d.info.label)}</span>`;
}

function openLabelHtml(e) {
  const os = openState(state.hours?.[e.id]);
  if (!os) return '';
  return ` · <span class="${os.open ? (os.closesSoon ? 'os-soon' : 'os-open') : 'os-closed'}">${os.open ? (os.closesSoon ? 'Ferme bientôt' : 'Ouvert') : 'Fermé'}</span>`;
}
function renderCards() {
  const box = $('#cards');
  if (!state.establishments.size) { box.innerHTML = ''; return; }
  const ref = refPoint();
  const b = map.getBounds();
  const visible = [...state.establishments.values()].filter((e) => b.contains([e.lng, e.lat]) && passesFilter(e));
  if (!visible.length) {
    box.innerHTML = filtersActive()
      ? '<div class="cards-empty">Aucun restaurant ne correspond à tes filtres ici. <button type="button" class="link-btn" id="btn-funset">Retirer les filtres</button></div>'
      : '<div class="cards-empty">Aucun restaurant dans cette zone. Dézoome ou déplace la carte.</div>';
    const un = $('#btn-funset');
    if (un) un.onclick = () => { filters.brands.clear(); filters.levels.clear(); filters.drive = false; saveFilters(); renderMarkers(); renderCards(); };
    setFocus(null);
    return;
  }
  const list = visible
    .map((e) => ({ e, d: distanceM(ref.lat, ref.lng, e.lat, e.lng) }))
    .sort((a, b2) => a.d - b2.d)
    .slice(0, 60);
  const fromMe = !!myPosition();
  box.innerHTML = `<div class="cards-count">${visible.length}<small>resto${visible.length > 1 ? 's' : ''}<br>ici</small></div>` + list.map(({ e, d }) => `
    <button class="card" data-id="${e.id}" type="button">
      <p class="card-title">${partnerOf(e.id) ? '<span class="card-star" title="Partenaire">⭐</span> ' : ''}${esc(e.name)}</p>
      <div class="card-sub">${esc(e.city)}${fromMe ? ` · <span class="card-dist">${fmtDistance(d > 150 ? (cachedRoute(e, myPosition()) || estimateRoute(d, ROUTE)).m : d)}</span>` : ''}${openLabelHtml(e)}</div>
      <div class="card-row">
        ${e.has_dine_in ? chipHtml('Salle', e.status_salle) : ''}
        ${e.has_drive ? chipHtml('Drive', e.status_drive) : ''}
      </div>
      ${partnerOf(e.id)?.offer ? `<div class="card-offer">🎁 ${esc(partnerOf(e.id).offer.title)}</div>` : ''}
    </button>`).join('');
  box.scrollLeft = 0;
  setFocus(list[0]?.e.id || null);
}
$('#cards').addEventListener('click', (ev) => {
  const c = ev.target.closest('.card');
  if (c) openDetail(c.dataset.id);
});
let cardsTimer;
let cardsMove = false; // déplacement de carte provoqué par la liste : ne pas reconstruire la liste
map.on('moveend', () => {
  if (cardsMove) { cardsMove = false; cardsSettle = false; } // la liste reste telle quelle
});

// Resto « en avant » : la 1re carte visible à gauche de la liste. Sa pastille est entourée sur la carte.
// (focusId déclaré plus haut)
function setFocus(id) {
  if (focusId && focusId !== id) state.markers.get(focusId)?.el.classList.remove('focus');
  focusId = id;
  if (id) state.markers.get(id)?.el.classList.add('focus');
  for (const c of clusterMarkers) {
    const el = c.getElement();
    el.classList.toggle('focus', !!id && el.dataset.ids.split(',').includes(id));
  }
  document.querySelectorAll('#cards .card').forEach((c) => c.classList.toggle('focus', c.dataset.id === id));
}
function leftCard() {
  const box = $('#cards');
  const left = box.getBoundingClientRect().left;
  let best = null, bestD = Infinity;
  box.querySelectorAll('.card').forEach((c) => {
    const d = Math.abs(c.getBoundingClientRect().left - left);
    if (d < bestD) { bestD = d; best = c; }
  });
  return best;
}
// PC : la molette fait défiler la liste horizontalement, et on peut la faire glisser à la souris.
{
  const box = $('#cards');
  box.addEventListener('wheel', (ev) => {
    if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
    ev.preventDefault();
    box.scrollBy({ left: ev.deltaY, behavior: 'auto' });
  }, { passive: false });
  let drag = null;
  box.addEventListener('mousedown', (ev) => { if (ev.button === 0) drag = { x: ev.clientX, left: box.scrollLeft, moved: false }; });
  window.addEventListener('mousemove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x;
    if (Math.abs(dx) > 4) { drag.moved = true; box.style.scrollSnapType = 'none'; box.classList.add('dragging'); }
    if (drag.moved) box.scrollLeft = drag.left - dx;
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const moved = drag.moved; drag = null;
    box.style.scrollSnapType = ''; box.classList.remove('dragging');
    if (moved) box.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
  });
}

// Quand on fait défiler la liste, la carte suit le resto mis en avant.
let scrollTimer;
$('#cards').addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const c = leftCard();
    if (!c || c.dataset.id === focusId) return;
    setFocus(c.dataset.id);
    const e = state.establishments.get(c.dataset.id);
    if (!e) return;
    cardsMove = true;
    const hidden = !state.markers.get(e.id)?.onMap;
    map.easeTo({
      center: [e.lng, e.lat],
      zoom: hidden ? Math.min(Math.max(map.getZoom() + 1.5, 14), 16) : map.getZoom(),
      offset: [0, -70],
      duration: 600,
    });
  }, 160);
}, { passive: true });

// ---------------------------------------------------------------------------
// Feuille du bas
// ---------------------------------------------------------------------------
// Connexion depuis l'écran d'accueil : le formulaire s'affiche DANS la page bleue.
let authInWelcome = false;
function welcomeForm(on) {
  authInWelcome = on;
  $('#welcome').classList.toggle('with-form', on);
  $('#welcome-form').hidden = !on;
  if (!on) $('#welcome-form').innerHTML = '';
}
function openSheet(view, html) {
  document.getElementById('my-rank')?.remove();
  const zp = document.getElementById('zone-pick'); if (zp) zp.hidden = true;
  if (authInWelcome && view === 'auth' && !$('#welcome').hidden) {
    state.sheetView = view;
    $('#sheet-body').innerHTML = '';
    $('#welcome-form').innerHTML = html;
    $('#welcome').scrollTop = 0;
    return;
  }
  state.sheetView = view;
  $('#sheet-body').innerHTML = html;
  // Profil (compte, personnalisation, profil public) : plein écran sur téléphone, toute la hauteur sur PC.
  const full = ['account', 'custom', 'public'].includes(view);
  // Fiche resto : monte jusqu'en haut, mais la carte reste visible autour (pas en plein écran comme le profil).
  $('#sheet').classList.toggle('tall', view === 'detail');
  $('#sheet').classList.toggle('full', full);
  document.documentElement.classList.toggle('sheet-full', full);
  $('#sheet').hidden = false;
  $('#backdrop').hidden = false;
  $('#sheet-body').scrollTop = 0;
  requestAnimationFrame(updateScrollHints);
  [250, 700, 1500].forEach((t) => setTimeout(updateScrollHints, t));
  $('#cards').style.visibility = 'hidden';
}
function closeSheet() {
  document.getElementById('my-rank')?.remove();
  detailShown = null;
  document.documentElement.classList.remove('sheet-full');
  if (authInWelcome) { welcomeForm(false); state.sheetView = null; return; }
  state.sheetView = null;
  $('#sheet').hidden = true;
  $('#backdrop').hidden = true;
  $('#cards').style.visibility = '';
  if (state.selectedId) {
    state.markers.get(state.selectedId)?.el.classList.remove('selected');
    state.selectedId = null;
  }
}
$('#backdrop').addEventListener('click', closeSheet);

// Flèches de défilement de la feuille : ↓ s'il reste du contenu en bas (ex. bouton Signaler), ↑ une fois descendu.
// Classement : « ma place » = barre posée sur l'écran (hors de la feuille), toujours à 10 px du bas visible,
// alignée sur la liste. Retirée dès qu'on change d'onglet ou qu'on ferme la feuille.
function myRankBar(html) {
  let el = document.getElementById('my-rank');
  if (!html) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'my-rank'; el.className = 'lb-me lb-me-fixed'; document.body.appendChild(el); }
  el.innerHTML = html;
  alignMyRank();
}
function alignMyRank() {
  const el = document.getElementById('my-rank'), l = document.getElementById('lb-list');
  if (!el) return;
  if (!l || state.sheetView !== 'account' || $('#sheet').hidden) { el.remove(); return; }
  const r = l.getBoundingClientRect();
  if (!r.width) return;
  el.style.left = `${r.left}px`; el.style.width = `${r.width}px`;
}
window.addEventListener('resize', alignMyRank);
function updateScrollHints() {
  const b = $('#sheet-body');
  const more = b.scrollHeight - b.clientHeight - b.scrollTop > 40;
  $('#hint-down').hidden = $('#sheet').hidden || !more || !!document.getElementById('my-rank'); // classement : ma place collée en bas à la place de la flèche
  $('#hint-up').hidden = $('#sheet').hidden || b.scrollTop < 80;
}
$('#sheet-body').addEventListener('scroll', updateScrollHints, { passive: true });
new MutationObserver(() => requestAnimationFrame(updateScrollHints)).observe($('#sheet-body'), { childList: true, subtree: true });
window.addEventListener('resize', updateScrollHints);
// Images (avatar, ruban…) et animation d'ouverture changent la hauteur après coup : on revérifie.
$('#sheet-body').addEventListener('load', () => requestAnimationFrame(updateScrollHints), true);
['transitionend', 'animationend'].forEach((ev) => $('#sheet').addEventListener(ev, updateScrollHints));
if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(updateScrollHints)).observe($('#sheet-body'));
$('#hint-down').addEventListener('click', () => { const b = $('#sheet-body'); b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); });
$('#hint-up').addEventListener('click', () => $('#sheet-body').scrollTo({ top: 0, behavior: 'smooth' }));
$('.sheet-grip').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

const ICON = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  google: '<svg class="g-ico" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>',
};

// ---------------------------------------------------------------------------
// Avis des testeurs (table feedback, lue dans Supabase)
// ---------------------------------------------------------------------------
function openFeedback() {
  openSheet('feedback', `
    <div class="sheet-head">
      <div class="grow"><h2>Ton avis</h2><div class="sub">Un bug, une idée, une info fausse sur un resto ? Dis-nous tout.</div></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <textarea id="fb-text" class="select" rows="6" maxlength="2000" placeholder="Ex. : le Drive du McDo de … est fermé le dimanche" style="width:100%;font-size:16px;resize:vertical"></textarea>
    <button type="button" class="btn btn-primary" id="fb-send" style="margin-top:10px">Envoyer</button>
    <p class="muted" style="font-size:12.5px">Ou par e-mail : contact.yadupeuple@gmail.com</p>`);
  $('#btn-close').onclick = closeSheet;
  setTimeout(() => $('#fb-text')?.focus(), 80);
  $('#fb-send').onclick = async () => {
    const btn = $('#fb-send'); btn.disabled = true;
    try {
      const ctx = [`v${APP_VERSION}`, state.selectedId ? `resto ${state.selectedId}` : '', navigator.userAgent.slice(0, 200)].filter(Boolean).join(' | ');
      const r = await api.submitFeedback($('#fb-text').value, ctx);
      toast(r?.message || 'Merci !');
      if (r?.ok) closeSheet(); else btn.disabled = false;
    } catch (err) { toast(err.message || 'Envoi impossible pour le moment.'); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------------------
// Installer l'appli sur l'écran d'accueil (ceux qui l'installent reviennent bien plus souvent)
// ---------------------------------------------------------------------------
let installEvent = null;
window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); installEvent = ev; });
window.addEventListener('appinstalled', () => { installEvent = null; toast("Appli installée ✅ Retrouve-la sur ton écran d'accueil."); });
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function canInstall() { return !isStandalone() && (!!installEvent || isIos() || /Android/.test(navigator.userAgent)); }
async function installApp() {
  if (installEvent) {
    const ev = installEvent; installEvent = null;
    ev.prompt();
    try { await ev.userChoice; } catch {}
    return;
  }
  const steps = isIos()
    ? ['Ouvre cette page dans <b>Safari</b>.', 'Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).', 'Choisis <b>Sur l\'écran d\'accueil</b>, puis <b>Ajouter</b>.']
    : ['Touche les <b>3 points</b> en haut à droite du navigateur.', 'Choisis <b>Ajouter à l\'écran d\'accueil</b> (ou <b>Installer l\'application</b>).', 'Valide avec <b>Installer</b>.'];
  openSheet('install', `
    <div class="sheet-head">
      <div class="grow"><h2>L'appli sur ton écran d'accueil</h2><div class="sub">Une icône comme une vraie appli, sans passer par un store.</div></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <ol class="gps-steps">${steps.map((t) => `<li>${t}</li>`).join('')}</ol>`);
  $('#btn-close').onclick = closeSheet;
}

// ---------------------------------------------------------------------------
// Partage (WhatsApp, Snapchat, Facebook, Instagram via le menu du téléphone…)
// ---------------------------------------------------------------------------
const APP_URL = 'https://yadupeuple.github.io/';
const APP_VERSION = (import.meta.url.match(/v=(\d+)/) || [])[1] || '?';
function openShare(e = null) {
  // Lien d'invitation perso : ?p=CODE (parrainage). Sur une fiche : ?r=resto (+ code si connecté).
  const code = state.profile?.ref_code;
  const params = [e ? `r=${e.id}` : '', code ? `p=${code}` : ''].filter(Boolean).join('&');
  const url = params ? `${APP_URL}?${params}` : APP_URL;
  const text = e
    ? `${e.name} : y'a du peuple en ce moment ? Regarde l'affluence en direct 👉`
    : "Y'a du peuple ? L'affluence des fast-foods en direct, salle et Drive 🍔👉";
  const full = `${text} ${url}`;
  const u = encodeURIComponent(url), t = encodeURIComponent(full);
  // [nom, fond, lien, logo officiel]
  const links = [
    ['WhatsApp', '#25D366', `https://wa.me/?text=${t}`, 'whatsapp'],
    ['Instagram', 'linear-gradient(45deg,#F58529,#DD2A7B 50%,#8134AF 75%,#515BD4)', 'instagram', 'instagram'],
    ['Snapchat', '#FFFC00', `https://www.snapchat.com/scan?attachmentUrl=${u}`, 'snapchat'],
    ['Facebook', '#0866FF', `https://www.facebook.com/sharer/sharer.php?u=${u}`, 'facebook'],
    ['Messenger', '#0084FF', `fb-messenger://share/?link=${u}`, 'messenger'],
    ['X', '#000000', `https://twitter.com/intent/tweet?text=${t}`, 'x'],
    ['Telegram', '#26A5E4', `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text)}`, 'telegram'],
    ['SMS', '#14B8A6', `sms:?&body=${t}`, null],
    ['E-mail', '#0B1F3A', `mailto:?subject=${encodeURIComponent("Y'a du peuple ?")}&body=${t}`, null],
  ];
  const logo = (n, key, c) => key
    ? `<svg viewBox="0 0 24 24" class="brand-ico"><path fill="${c === '#FFFC00' ? '#000' : '#fff'}" d="${BRAND_PATHS[key]}"/></svg>`
    : (n === 'SMS' ? '💬' : '✉️');
  openSheet('share', `
    <div class="sheet-head">
      <div class="grow"><h2>${e ? 'Partager ce resto' : 'Inviter des amis'}</h2><div class="sub">Plus on est nombreux à signaler, plus l'info est fiable.</div></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    ${navigator.share ? `<button class="btn btn-primary" id="share-native">${ICON.share}Partager</button>` : ''}
    <div class="share-grid">${links.map(([n, c, href, key]) => `
      <a class="share-item" href="${href === 'instagram' ? 'https://www.instagram.com/direct/inbox/' : href}" ${href === 'instagram' ? 'data-insta="1"' : ''} target="_blank" rel="noopener"><span class="share-ico" style="background:${c}">${logo(n, key, c)}</span>${n}</a>`).join('')}
      <button type="button" class="share-item" id="share-copy"><span class="share-ico" style="background:#E5E7EB;color:#0B1F3A">🔗</span>Copier le lien</button>
    </div>
    <p class="muted" style="font-size:12.5px;margin-top:10px">Instagram : le lien est copié automatiquement, il suffit de le coller dans un message ou une story.</p>`);
  const insta = document.querySelector('[data-insta]');
  if (insta) insta.addEventListener('click', () => { navigator.clipboard?.writeText(full).then(() => toast('Lien copié : colle-le dans Instagram'), () => {}); });
  $('#btn-close').onclick = () => (e ? renderDetail(e.id) : closeSheet());
  const nat = document.querySelector('#share-native');
  if (nat) nat.onclick = () => navigator.share({ title: "Y'a du peuple ?", text, url }).catch(() => {});
  $('#share-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(full); toast('Lien copié ✅'); }
    catch { toast(url, 5000); }
  };
}

// ---------------------------------------------------------------------------
// Fiche restaurant
// ---------------------------------------------------------------------------
const detailExtra = new Map(); // id -> { history: {salle, drive}, calmer }

function serviceBlock(e, service) {
  const st = service === 'salle' ? e.status_salle : e.status_drive;
  const d = describeStatus(st);
  const hist = detailExtra.get(e.id)?.history?.[service];
  const waitHtml = service === 'drive' && st?.wait && WAIT_INFO[st.wait]
    ? `<div class="service-wait"><span class="emo">🚗</span>File au Drive : ${WAIT_INFO[st.wait].label}</div>` : '';
  const histHtml = hist && hist.length ? `
    <details class="history">
      <summary>Derniers signalements (${hist.length})</summary>
      <ul>${hist.map((h) => `<li><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${levelInfo(h.level).color}"></span>${esc(levelInfo(h.level).label)}<span class="muted" style="margin-left:auto">${ago(h.minutes_ago)}</span></li>`).join('')}</ul>
    </details>` : '';
  return `
    <div class="service">
      <div class="service-top"><span class="service-name">${service === 'salle' ? 'En salle' : 'Au Drive'}</span></div>
      <div class="level-badge"><span class="dot" style="background:${d.info.color}"></span>${esc(d.info.label)}</div>
      <div class="service-line">${esc(d.line)}</div>
      ${waitHtml}
      ${histHtml}
    </div>`;
}

const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
let curveDay = null; // jour affiché dans le graphique (0 = dimanche), null = aujourd'hui

function liveStatusOf(e) {
  const st = mainStatus(e);
  return st && (st.state === 'recent' || st.state === 'a_confirmer') && !st.uncertain && st.level ? st : null;
}

function curveHtml(e, profile, loading = false) {
  const { h, dow } = parisNow();
  if (loading) {
    // Courbe pas encore chargée : barres grises qui clignotent (évite d'afficher la courbe type 1 s avant la vraie)
    const bars = [30, 45, 70, 55, 35, 30, 40, 65, 80, 60, 40, 25].map((v) => `<div class="bar bar-wait" style="height:${v}%"></div>`).join('');
    return `
      <div class="curve">
        <h3>Affluence habituelle aujourd'hui</h3>
        <div class="bars">${bars}</div>
        <div class="bar-labels"><span></span></div>
      </div>`;
  }
  if (!profile) {
    // Pas de courbe Google pour ce resto : courbe type des fast-foods
    const hours = [];
    const ohT = state.hours?.[e.id], dT = gDay(dow);
    for (let t = 11; t <= 22; t++) if (openDuringHour(ohT, dT, t) !== false) hours.push(t);
    if (!hours.length) for (let t = 11; t <= 22; t++) hours.push(t);
    const heights = { calme: 25, modere: 50, frequente: 75, tres_frequente: 100 };
    const bars = hours.map((t) => {
      const lvl = theoryLevelAt(t + 0.25, dow);
      const info = lvl ? LEVEL_INFO[lvl] : NO_INFO;
      const now = Math.floor(h) === t ? ' now' : '';
      return `<div class="bar${now}" style="height:${lvl ? heights[lvl] : 6}%;background:${info.color}" title="${t}h : ${info.label}"></div>`;
    }).join('');
    const labels = hours.map((t) => `<span>${t % 2 === 1 ? t + 'h' : ''}</span>`).join('');
    return `
      <div class="curve">
        <h3>Affluence habituelle aujourd'hui</h3>
        <div class="bars">${bars}</div>
        <div class="bar-labels">${labels}</div>
        <div class="curve-note">Courbe type des fast-foods : pas encore de données propres à ce resto.</div>
      </div>`;
  }
  const todayG = gDay(h < 5 ? (dow === 1 ? 7 : dow - 1) : dow);
  const day = curveDay ?? todayG;
  const isToday = day === todayG;
  const nowH = Math.floor(h);
  const live = isToday ? liveStatusOf(e) : null;
  const hours = dayHours(profile, day, state.hours?.[e.id]);
  const tabs = [1, 2, 3, 4, 5, 6, 0].map((d) =>
    `<button type="button" class="day-tab${d === day ? ' on' : ''}" data-day="${d}">${d === todayG ? 'Auj.' : DAY_SHORT[d]}</button>`).join('');
  let body;
  if (!hours.length) {
    body = '<div class="curve-note">Fermé ou pas assez de passage ce jour-là.</div>';
  } else {
    const bars = hours.map((x) => {
      const isNow = isToday && x.h === nowH;
      let lvl = levelFromPercent(x.v);
      let height = Math.max(4, x.v || 0);
      let cls = isNow ? ' now' : '';
      let title = `${x.h}h : ${lvl ? LEVEL_INFO[lvl].label : 'calme'} d'habitude`;
      if (isNow && live) {
        // Un signalement récent remplace l'habitude pour l'heure actuelle
        lvl = live.level;
        height = { calme: 25, modere: 50, frequente: 75, tres_frequente: 100 }[lvl];
        cls += ' live';
        title = `Maintenant : ${LEVEL_INFO[lvl].label} (signalé)`;
      }
      const info = lvl ? LEVEL_INFO[lvl] : NO_INFO;
      return `<div class="bar${cls}" style="height:${height}%;background:${info.color}" title="${esc(title)}"></div>`;
    }).join('');
    const labels = hours.map((x, i) => `<span>${x.h % 3 === 0 ? x.h + 'h' : ''}</span>`).join('');
    body = `<div class="bars">${bars}</div><div class="bar-labels">${labels}</div>`;
  }
  const note = live
    ? '<span class="live-dot"></span> Barre de l\'heure actuelle : signalement en direct.'
    : 'D\'après les heures d\'affluence Google Maps ; vos signalements prennent le dessus et affinent la courbe.';
  return `
    <div class="curve">
      <h3>Affluence habituelle</h3>
      <div class="day-tabs">${tabs}</div>
      ${body}
      <div class="curve-note">${note}</div>
    </div>`;
}

function hoursHtml(e) {
  const h = state.hours?.[e.id];
  const os = openState(h);
  if (!os) return '';
  const today = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' }).format(new Date());
  const rows = hoursLines(h).map((l) =>
    `<li class="${l.name.toLowerCase() === today ? 'today' : ''}"><span>${l.name}</span><span>${esc(l.text)}</span></li>`).join('');
  return `<details class="hours">
    <summary class="${os.open ? (os.closesSoon ? 'os-soon' : 'os-open') : 'os-closed'}">${esc(os.label)}</summary>
    <ul>${rows}</ul>
  </details>`;
}

// Vrai trajet par la route (OSRM, gratuit) : seulement à l'ouverture d'une fiche ; sinon on garde l'estimation.
const routeCache = new Map();
const routeKey = (e, p) => `${e.id}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
function cachedRoute(e, p) { const r = routeCache.get(routeKey(e, p)); return r && r.m ? r : null; }
async function refineRoute(e, p) {
  const key = routeKey(e, p);
  const prev = routeCache.get(key);
  if (prev && !(prev.failed && Date.now() - prev.failed > 60000)) return;
  routeCache.set(key, {});
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const url = `https://router.project-osrm.org/route/v1/driving/${p.lng.toFixed(5)},${p.lat.toFixed(5)};${e.lng.toFixed(5)},${e.lat.toFixed(5)}?overview=false&alternatives=false&steps=false`;
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    const j = await res.json();
    const rt = j?.code === 'Ok' && j.routes?.[0];
    if (!rt) { routeCache.set(key, { failed: Date.now() }); return; }
    const r = { m: rt.distance, min: Math.max(1, Math.round(rt.duration / 60)) };
    routeCache.set(key, r);
    const dist = $('#route-dist'), time = $('#route-time');
    if (dist && time && state.selectedId === e.id) {
      dist.innerHTML = `<span class="emo emo-pin">📍</span>${fmtDistance(r.m)}`;
      time.innerHTML = `<span class="emo">🚗</span>${fmtDuration(r.min)} de trajet`;
    }
    const sub = document.querySelector(`#cards .card[data-id="${e.id}"] .card-dist`);
    if (sub) sub.textContent = fmtDistance(r.m);
  } catch { routeCache.set(key, { failed: Date.now() }); }
}

function routeHtml(e) {
  const p = myPosition();
  if (!p) {
    return `<div class="route"><button type="button" class="chip chip-btn" id="btn-route-gps"><span class="emo emo-pin">📍</span>Voir le temps de trajet</button>${goHtml(e)}</div>`;
  }
  const d = distanceM(p.lat, p.lng, e.lat, e.lng);
  const real = d > 150 ? cachedRoute(e, p) : null;
  const r = real || estimateRoute(d, ROUTE);
  const approx = real ? '' : '≈ ';
  const parts = [`<span class="chip" id="route-dist"><span class="emo emo-pin">📍</span>${d > 150 ? approx + fmtDistance(r.m) : fmtDistance(d)}</span>`];
  if (d > 150) {
    parts.push(`<span class="chip" id="route-time"><span class="emo">🚗</span>${approx}${fmtDuration(r.min)} de trajet</span>`);
    if (!real) setTimeout(() => refineRoute(e, p), 0);
  }
  if (e.has_drive) {
    const w = e.status_drive?.wait && WAIT_INFO[e.status_drive.wait];
    parts.push(w
      ? `<span class="chip">+ file au Drive : ${w.short} voitures</span>`
      : `<span class="chip chip-muted">File au Drive : pas d'info récente</span>`);
  }
  // « S'y rendre » juste après le trajet (la file du Drive passe en dessous)
  parts.splice(d > 150 ? 2 : 1, 0, goHtml(e));
  return `<div class="route">${parts.join('')}</div>`;
}
// « S'y rendre » : ouvre Google Maps (l'appli si elle est installée) en itinéraire voiture.
function goHtml(e) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}&travelmode=driving`;
  return `<a class="chip chip-go" href="${url}" target="_blank" rel="noopener" id="btn-go"><span class="emo emo-flat">🧭</span>S'y rendre</a>`;
}

// Resto dont la fiche est affichée : quand on la redessine (jour du graphique, rafraîchissement…), on garde la position de défilement.
let detailShown = null;
function renderDetail(id) {
  const e = state.establishments.get(id);
  if (!e) return;
  const keepScroll = state.sheetView === 'detail' && detailShown === id && !$('#sheet').hidden ? $('#sheet-body').scrollTop : null;
  const profile = detailExtra.get(id)?.profile || null;
  const curveLoading = !detailExtra.has(id);
  const calmer = detailExtra.get(id)?.calmer;
  const fav = state.favorites.has(id);
  const back = detailBack?.for === id ? state.establishments.get(detailBack.from) : null;
  const html = `
    ${back ? `<button type="button" class="back-link" id="btn-detail-back">‹ Retour à ${esc(back.name)}</button>` : ''}
    <div class="sheet-head">
      <div class="grow">
        <h2>${esc(e.name)}</h2>
        <div class="sub">${esc((e.address || '').replace(/\n/g, ', '))}</div>
        ${hoursHtml(e)}
      </div>
      <button class="round-btn" id="btn-share" aria-label="Partager">${ICON.share}</button>
      <button class="round-btn ${fav ? 'fav-on' : ''}" id="btn-fav" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${ICON.star}</button>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    ${routeHtml(e)}
    ${partnerHtml(e)}
    ${e.has_dine_in ? serviceBlock(e, 'salle') : ''}
    ${e.has_drive ? serviceBlock(e, 'drive') : ''}
    ${calmer?.label ? (calmer.id && state.establishments.has(calmer.id)
      ? `<button type="button" class="hint hint-go" id="btn-calmer"><span class="hint-grid"><span>💡</span><span>${esc(calmer.label)}</span>${calmer.distance_m != null ? `<span>📍</span><small>à ${calmer.distance_m < 1000 ? calmer.distance_m + ' m' : (calmer.distance_m / 1000).toFixed(1).replace('.', ',') + ' km'}</small>` : ''}</span><span class="hint-arrow">›</span></button>`
      : `<div class="hint">💡 ${esc(calmer.label)}</div>`) : ''}
    ${curveHtml(e, profile, curveLoading)}
    <button class="btn btn-primary" id="btn-report">J'y suis : je signale l'affluence</button>
  `;
  openSheet('detail', html);
  if (keepScroll !== null) { $('#sheet-body').scrollTop = keepScroll; requestAnimationFrame(updateScrollHints); }
  detailShown = id;
  $('#btn-close').onclick = closeSheet;
  $('#btn-report').onclick = () => openReport(id);
  const bc = $('#btn-calmer'); if (bc) bc.onclick = () => openDetail(calmer.id, id);
  const bb = $('#btn-detail-back'); if (bb) bb.onclick = () => { const f = detailBack.from; detailBack = null; openDetail(f); };
  const gpsBtn = document.querySelector('#btn-route-gps');
  if (gpsBtn) gpsBtn.onclick = () => askLocation();
  document.querySelectorAll('#sheet-body .day-tab').forEach((b) => b.onclick = () => { curveDay = Number(b.dataset.day); renderDetail(id); });
  $('#btn-fav').onclick = () => toggleFav(id);
  $('#btn-share').onclick = () => openShare(e);
  document.querySelectorAll('#sheet-body [data-ptrack]').forEach((a) => a.addEventListener('click', () => api.partnerTrack(id, 'click')));
}

// Centre le resto dans la partie de carte visible au-dessus de la fiche.
function focusResto(e) {
  const sheetH = Math.min(window.innerHeight * 0.62, 640);
  map.flyTo({
    center: [e.lng, e.lat],
    // Zoom limité pour voir les autres restos autour (au-dessus de la fiche) : entre 13 et 14,5.
    zoom: Math.min(Math.max(map.getZoom(), 13), 14.5),
    offset: [0, -sheetH / 2],
    duration: 900,
    essential: true,
  });
}

let detailBack = null; // { for: id affiché, from: id de la fiche d'origine } (« Plus calme à côté »)
async function openDetail(id, fromId) {
  const e = state.establishments.get(id);
  if (!e) return;
  if (fromId) detailBack = { for: id, from: fromId };
  else if (detailBack?.for !== id) detailBack = null;
  if (state.selectedId && state.selectedId !== id) state.markers.get(state.selectedId)?.el.classList.remove('selected');
  state.selectedId = id;
  state.markers.get(id)?.el.classList.add('selected');
  curveDay = null;
  detailShown = null; // nouvelle fiche : on part du haut
  if (partnerOf(id)) api.partnerTrack(id, 'view');
  setFocus(id); // un seul resto entouré : celui de la fiche
  focusResto(e);
  renderDetail(id);
  // Données fraîches pour cette fiche
  try {
    const [salle, drive, hs, hd, calmer, profile] = await Promise.all([
      e.has_dine_in ? api.serviceStatus(id, 'salle') : null,
      e.has_drive ? api.serviceStatus(id, 'drive') : null,
      e.has_dine_in ? api.history(id, 'salle') : [],
      e.has_drive ? api.history(id, 'drive') : [],
      e.has_dine_in ? api.calmerNearby(id).catch(() => null) : null,
      api.popularTimes ? api.popularTimes(id).catch(() => null) : null,
    ]);
    if (e.has_dine_in) e.status_salle = salle;
    if (e.has_drive) e.status_drive = drive;
    detailExtra.set(id, { history: { salle: hs || [], drive: hd || [] }, calmer, profile });
    renderMarkers();
    if (state.sheetView === 'detail' && state.selectedId === id) renderDetail(id);
  } catch (err) {
    if (!detailExtra.has(id)) {
      detailExtra.set(id, { history: { salle: [], drive: [] }, calmer: null, profile: null });
      if (state.sheetView === 'detail' && state.selectedId === id) renderDetail(id);
    }
    toast(err.message || 'Impossible de charger la fiche.');
  }
}

async function toggleFav(id) {
  if (!state.user) { openAccount('Connecte-toi pour garder tes restos favoris.'); return; }
  try {
    const msg = await api.toggleFavorite(id);
    if (msg === 'Ajoute aux favoris') state.favorites.add(id);
    else if (msg === 'Retire des favoris') state.favorites.delete(id);
    toast(msg === 'Ajoute aux favoris' ? (pushSupported() && Notification.permission === 'default' && !store.get('ydp_push_hint') ? (store.set('ydp_push_hint', '1'), 'Ajouté ⭐ Active les alertes dans Réglages 🔔') : 'Ajouté aux favoris ⭐') : msg === 'Retire des favoris' ? 'Retiré des favoris' : msg);
    if (state.sheetView === 'detail') renderDetail(id);
  } catch (err) { toast(err.message); }
}

// ---------------------------------------------------------------------------
// Signalement
// ---------------------------------------------------------------------------
function getPreciseLocation() {
  const t = testPosition();
  if (t) return Promise.resolve(t);
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Ton navigateur ne donne pas accès au GPS.")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => {
        if (err.code === 1) reject(new Error('Autorise la localisation pour signaler (réglages du navigateur).'));
        else if (err.code === 3) reject(new Error('Le GPS met trop de temps à répondre. Réessaie dehors ou près d\'une fenêtre.'));
        else reject(new Error('Position GPS indisponible. Active la localisation précise puis réessaie.'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function openReport(id, presetService) {
  const e = state.establishments.get(id);
  if (!e) return;
  if (!state.user) { openAccount('Crée un compte (gratuit) pour signaler et gagner des points.', () => openReport(id, presetService)); return; }
  const services = [e.has_dine_in && 'salle', e.has_drive && 'drive'].filter(Boolean);
  const form = { service: presetService || services[0], level: null, wait: null };

  const render = (error = '') => {
    const html = `
      <div class="sheet-head">
        <button class="round-btn" id="btn-back" aria-label="Retour">${ICON.back}</button>
        <div class="grow"><h2>Signaler</h2><div class="sub">${esc(e.name)}</div></div>
      </div>
      ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
      ${services.length > 1 ? `
        <div class="seg" role="tablist">
          ${services.map((s) => `<button data-service="${s}" class="${form.service === s ? 'on' : ''}">${s === 'salle' ? '<span class="emo emo-flat">🍔</span>En salle' : '<span class="emo">🚗</span>Au Drive'}</button>`).join('')}
        </div>` : ''}
      <div class="label">${form.service === 'drive' ? 'Comment ça bouge au Drive ?' : 'Combien de monde en salle ?'}</div>
      <div class="levels">
        ${LEVELS.map((l) => `<button class="level-btn ${form.level === l ? 'on' : ''}" data-level="${l}" style="background:${LEVEL_INFO[l].soft}"><span class="dot" style="background:${LEVEL_INFO[l].color}"></span>${esc(LEVEL_INFO[l].label)}</button>`).join('')}
      </div>
      <details class="lexique ${form.level ? 'picked' : ''}" ${form.lexOpen ? 'open' : ''}>
        <summary class="lx-title">💡 Comment choisir ?<span class="pc-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span></summary>
        ${LEVELS.map((l) => `<div class="lx-row ${form.level === l ? 'on' : ''}"><span class="dot" style="background:${LEVEL_INFO[l].color}"></span><div><b>${esc(LEVEL_INFO[l].label)}</b> ${esc(LEXIQUE[form.service === 'drive' ? 'drive' : 'salle'][l])}</div></div>`).join('')}
      </details>
      ${form.service === 'drive' ? `
        <div class="label">Voitures dans la file <span class="muted">(facultatif)</span></div>
        <div class="cars">
          ${Object.entries(WAIT_INFO).map(([k, v]) => `<button data-wait="${k}" class="${form.wait === k ? 'on' : ''}">${v.short}<small>voitures</small></button>`).join('')}
        </div>` : ''}
      <button class="btn btn-primary" id="btn-send" ${form.level ? '' : 'disabled'}>Envoyer mon signalement</button>
      <p class="muted" style="text-align:center;margin-top:10px">Il faut être à moins de 100 m du restaurant.${testPosition() ? ' <b>Position de test active.</b>' : ''}</p>
    `;
    openSheet('report', html);
    $('#btn-back').onclick = () => openDetail(id);
    $('#sheet-body').querySelectorAll('[data-service]').forEach((b) => b.onclick = () => { form.service = b.dataset.service; form.wait = null; render(); });
    $('#sheet-body').querySelectorAll('[data-level]').forEach((b) => b.onclick = () => { form.level = b.dataset.level; render(); });
    const lx = $('#sheet-body .lexique'); if (lx) lx.ontoggle = () => { form.lexOpen = lx.open; };
    $('#sheet-body').querySelectorAll('[data-wait]').forEach((b) => b.onclick = () => { form.wait = form.wait === b.dataset.wait ? null : b.dataset.wait; render(); });
    $('#btn-send').onclick = send;
  };

  const send = async () => {
    const btn = $('#btn-send');
    btn.disabled = true;
    btn.textContent = 'Localisation en cours…';
    let pos;
    try {
      pos = await getPreciseLocation();
    } catch (err) { if (/Autorise la localisation/.test(err.message)) { gpsHelp('denied'); return; } render(err.message); return; }
    btn.textContent = 'Envoi…';
    let res;
    try {
      res = await api.submitReport({ establishmentId: id, service: form.service, level: form.level, wait: form.wait, ...pos });
    } catch (err) { render(err.message); return; }
    if (!res?.ok) {
      let msg = res?.message || 'Signalement impossible pour le moment.';
      if (res?.error === 'too_far' && res.distance_m != null) msg += ` (tu es à ${fmtDistance(res.distance_m)}, limite ${res.limit_m} m)`;
      if (res?.error === 'location_inaccurate' && res.accuracy_m != null) msg += ` (précision ${res.accuracy_m} m, max ${res.max_accuracy_m} m)`;
      render(msg);
      return;
    }
    showReportResult(id, res);
  };

  render();
}

// Petit lexique sous les 4 choix du signalement (idée d'Alexis et de sa femme, 17/11/2026)
const LEXIQUE = {
  salle: {
    calme: ': des tables libres partout, personne ou presque aux bornes et au comptoir.',
    modere: ': quelques clients qui attendent, on trouve encore une table sans chercher.',
    frequente: ': file aux bornes ou au comptoir, salle bien remplie, plus que quelques tables de libres.',
    tres_frequente: ': salle pleine, longue attente, du monde debout qui attend sa commande.',
  },
  drive: {
    calme: ': on passe direct, pas ou presque pas d\'attente.',
    modere: ': quelques voitures, mais ça avance bien.',
    frequente: ': la file avance lentement, on patiente au guichet.',
    tres_frequente: ': la file déborde, jusque sur le parking ou la route.',
  },
};

const BADGE_NAMES = {
  v1: 'Premier signalement', v10: '5 signalements', v50: '10 signalements', v100: '25 signalements',
  v250: '50 signalements', v500: '100 signalements', drive10: 'Éclaireur du Drive',
  explorer: 'Explorateur', explorer10: 'Gastronome', explorer15: 'Cartographe', explorer20: 'Habitué du Drive', explorer30: 'Voyageur international', tour_zone: 'Tour de la zone', tour_zone6: 'Baroudeur',
  tour_zone10: 'Globe-trotteur', testeur: 'Testeur fondateur', ref1: 'Parrain', ref10: 'Ambassadeur',
  ref30: 'Légende du bouche-à-oreille', coup_de_feu: 'Sentinelle', regulier: 'Régulier', regulier8: 'Fidèle', regulier12: 'Inarrêtable', fiable: 'Fiable', oeil_lynx: 'Œil de lynx',
};

function showReportResult(id, res) {
  const html = `
    <div class="result">
      <div style="font-size:42px">🙌</div>
      <h2 style="margin:6px 0">Merci, c'est envoyé !</h2>
      <div class="big">${res.points > 0 ? `+${res.points} point${res.points > 1 ? 's' : ''}` : 'Merci !'}</div>
      <p>${res.capped ? 'Tu es là depuis un moment : ton info compte toujours, mais plus de points ici aujourd\'hui.' : res.window_pos > 2 ? 'Merci pour la mise à jour, ton info reste fraîche pour les prochains clients.' : 'Ton info aide les prochains clients à éviter la foule.'}</p>
    </div>
    <button class="btn btn-primary" id="btn-result-share">${ICON.share}Inviter un ami</button>
    ${canInstall() ? `<button class="btn btn-ghost" id="btn-result-install" style="margin-top:8px">📲 Mettre l'appli sur mon écran d'accueil</button>` : ''}
    <button class="btn btn-dark" id="btn-done" style="margin-top:8px">Voir la fiche</button>
  `;
  openSheet('result', html);
  $('#btn-done').onclick = () => openDetail(id);
  $('#btn-result-share').onclick = () => openShare();
  const ri = $('#btn-result-install'); if (ri) ri.onclick = installApp;
  refreshProfile();
  openDetailRefreshOnly(id);
}

async function openDetailRefreshOnly(id) {
  const e = state.establishments.get(id);
  try {
    if (e.has_dine_in) e.status_salle = await api.serviceStatus(id, 'salle');
    if (e.has_drive) e.status_drive = await api.serviceStatus(id, 'drive');
    renderMarkers();
    renderCards();
  } catch {}
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------
const normTxt = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-'’]/g, ' ').replace(/\s+/g, ' ').trim();
function openSearch() {
  openSheet('search', `
    <div class="sheet-head">
      <div class="grow"><h2>Rechercher</h2></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <label class="search-input">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6B7280" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="search-q" type="search" placeholder="Enseigne, ville, adresse…" autocomplete="off" enterkeyhint="search">
    </label>
    <ul class="list" id="search-results"></ul>
  `);
  $('#btn-close').onclick = closeSheet;
  const input = $('#search-q');
  setTimeout(() => input.focus(), 80);
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      const ul = $('#search-results');
      if (q.length < 2) { ul.innerHTML = ''; return; }
      const p = myPosition();
      // Villes correspondantes (tous les restos sont déjà chargés) : un clic montre tous les restos de la ville.
      const nq = normTxt(q);
      const byCity = new Map();
      for (const e of state.establishments.values()) {
        const nc = normTxt(e.city);
        if (!nc.includes(nq)) continue;
        const k = nc;
        if (!byCity.has(k)) byCity.set(k, { name: e.city, list: [] });
        byCity.get(k).list.push(e);
      }
      const cities = [...byCity.values()]
        .sort((a, b) => (normTxt(a.name).startsWith(nq) ? 0 : 1) - (normTxt(b.name).startsWith(nq) ? 0 : 1) || b.list.length - a.list.length)
        .slice(0, 4);
      const cityHtml = cities.map((c, i) => `<li data-city="${i}" style="cursor:pointer">
            <span class="badge-ico" style="background:#E6F7F5">📍</span>
            <div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${c.list.length} resto${c.list.length > 1 ? 's' : ''} · voir sur la carte</div></div>
          </li>`).join('');
      const bindCities = () => ul.querySelectorAll('li[data-city]').forEach((li) => li.onclick = () => {
        const c = cities[+li.dataset.city];
        const b = new maplibregl.LngLatBounds();
        c.list.forEach((e) => b.extend([e.lng, e.lat]));
        closeSheet();
        map.fitBounds(b, { padding: { top: 90, bottom: 200, left: 40, right: 40 }, maxZoom: 14.5, duration: 1200 });
      });
      ul.innerHTML = cityHtml;
      bindCities();
      try {
        const rows = await api.search(q, p?.lat ?? null, p?.lng ?? null);
        if (input.value.trim() !== q) return;
        if (!rows?.length) { ul.innerHTML = cityHtml || '<li class="muted">Aucun restaurant trouvé.</li>'; bindCities(); return; }
        // Restos de la ville cherchée d'abord
        rows.sort((a, b) => (normTxt(a.city).includes(nq) ? 0 : 1) - (normTxt(b.city).includes(nq) ? 0 : 1));
        ul.innerHTML = cityHtml + rows.map((r) => {
          const st = describeStatus(mainStatus(r));
          return `<li data-id="${r.id}" style="cursor:pointer">
            <span class="badge-ico" style="background:${st.info.soft}"><span class="dot" style="width:12px;height:12px;border-radius:50%;background:${st.info.color}"></span></span>
            <div class="grow"><div class="t">${esc(r.name)}</div><div class="s">${esc(r.city)}${r.distance_m != null ? ' · ' + fmtDistance(r.distance_m) : ''} · ${esc(st.info.label)}</div></div>
          </li>`;
        }).join('');
        bindCities();
        ul.querySelectorAll('li[data-id]').forEach((li) => li.onclick = () => {
          openDetail(li.dataset.id);
        });
      } catch (err) { ul.innerHTML = `<li class="muted">${esc(err.message)}</li>`; }
    }, 250);
  });
}
$('#btn-search').addEventListener('click', openSearch);
$('#btn-filter').addEventListener('click', openFilters);
saveFilters(); // badge au démarrage

// ---------------------------------------------------------------------------
// Compte
// ---------------------------------------------------------------------------
let afterLogin = null;

function openAccount(message = '', then = null) {
  if (then) afterLogin = then;
  if (state.user) { renderAccount(); return; }
  renderAuth(message);
}
$('#btn-account').addEventListener('click', () => openAccount());

function renderAuth(message = '', mode = 'login', error = '') {
  openSheet('auth', `
    <div class="sheet-head">
      <div class="grow"><h2>${mode === 'login' ? 'Connexion' : 'Créer un compte'}</h2>
      ${message ? `<div class="sub">${esc(message)}</div>` : ''}</div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    ${mode === 'signup' ? `<ul class="benefits">
      <li>📍 Signale l'affluence en 2 secondes</li>
      <li>🏅 Gagne des points et des badges</li>
      <li>⭐ Garde tes restos favoris</li>
      <li>🏆 Grimpe au classement de ta ville</li>
    </ul>` : ''}
    ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
    <div class="social-auth">
      <div id="gis-btn" class="gis-btn"></div>
      <button type="button" class="btn btn-social" id="auth-google">${ICON.google}Continuer avec Google</button>
      <button type="button" class="btn btn-social" id="auth-magic">✉️ Recevoir un lien par e-mail</button>
    </div>
    <div class="or-sep"><span>ou avec un mot de passe</span></div>
    <form id="auth-form" novalidate>
      ${mode === 'signup' ? `<label class="field"><span>Pseudo (visible par les autres)</span><input name="pseudo" minlength="3" maxlength="20" autocomplete="nickname" required></label>` : ''}
      <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Mot de passe${mode === 'signup' ? ' (6 caractères minimum)' : ''}</span><input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" required></label>
      <button class="btn btn-primary" type="submit" id="auth-submit">${mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
    </form>
    <p style="text-align:center;margin:14px 0 0">
      <button class="link-btn" id="auth-switch">${mode === 'login' ? 'Pas encore de compte ? Créer un compte' : "J'ai déjà un compte : me connecter"}</button>
    </p>
  `);
  $('#btn-close').onclick = () => { afterLogin = null; closeSheet(); };
  $('#auth-switch').onclick = () => renderAuth(message, mode === 'login' ? 'signup' : 'login');
  $('#auth-google').onclick = async () => {
    try { await api.signInWithGoogle(); } catch (err) { renderAuth(message, mode, err.message); }
  };
  $('#auth-magic').onclick = () => renderMagic(message);
  mountGoogleButton(message, mode);
  $('#auth-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const email = String(f.get('email') || '').trim();
    const password = String(f.get('password') || '');
    const pseudo = String(f.get('pseudo') || '').trim();
    if (!email || !password) { renderAuth(message, mode, 'Renseigne ton e-mail et ton mot de passe.'); return; }
    if (mode === 'signup' && (pseudo.length < 3 || pseudo.length > 20)) { renderAuth(message, mode, 'Le pseudo doit faire de 3 à 20 caractères.'); return; }
    const btn = $('#auth-submit');
    btn.disabled = true;
    btn.textContent = 'Un instant…';
    try {
      if (mode === 'login') {
        await api.signIn(email, password);
      } else {
        const r = await api.signUp(email, password, pseudo);
        if (r.needsConfirmation) {
          openSheet('auth', `<div class="result"><div style="font-size:40px">📬</div><h2>Vérifie tes e-mails</h2><p>Clique sur le lien reçu pour activer ton compte, puis reviens te connecter.</p></div><button class="btn btn-dark" id="btn-ok">OK</button>`);
          $('#btn-ok').onclick = () => renderAuth('', 'login');
          return;
        }
        wantedPseudo = pseudo;
      }
      // La suite se fait dans onUserChanged().
    } catch (err) {
      renderAuth(message, mode, err.message);
    }
  };
}

// Bouton officiel Google : la fenêtre Google affiche « Y'a du peuple ? » au lieu de l'adresse technique Supabase.
// Si le script Google ne se charge pas, on garde notre bouton (connexion par redirection).
let gisPromise = null;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisPromise ||= new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = ok; s.onerror = ko;
    document.head.appendChild(s);
  });
  return gisPromise;
}
async function sha256Hex(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function mountGoogleButton(message, mode) {
  if (DEMO || !GOOGLE_CLIENT_ID) return;
  const box = document.querySelector('#gis-btn');
  if (!box) return;
  try {
    await loadGis();
    const raw = crypto.randomUUID() + crypto.randomUUID();
    const hashed = await sha256Hex(raw);
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashed,
      use_fedcm_for_button: true,
      callback: async (resp) => {
        try { await api.signInWithGoogleToken(resp.credential, raw); }
        catch (err) { renderAuth(message, mode, err.message); }
      },
    });
    const live = document.querySelector('#gis-btn');
    if (!live) return;
    google.accounts.id.renderButton(live, {
      theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'fr',
      width: Math.min(400, Math.max(220, live.clientWidth || 320)),
    });
    document.querySelector('#auth-google')?.setAttribute('hidden', '');
    live.classList.add('ready');
  } catch {
    // script Google bloqué : le bouton de secours reste visible
  }
}

function renderMagic(message = '', error = '') {
  openSheet('auth', `
    <div class="sheet-head">
      <button class="round-btn" id="btn-back" aria-label="Retour">${ICON.back}</button>
      <div class="grow"><h2>Lien de connexion</h2><div class="sub">Pas de mot de passe : tu reçois un lien par e-mail, tu cliques, c'est fait. Marche aussi pour créer un compte.</div></div>
    </div>
    ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
    <form id="magic-form" novalidate>
      <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
      <button class="btn btn-primary" type="submit" id="magic-submit">Envoyer le lien</button>
    </form>`);
  $('#btn-back').onclick = () => renderAuth(message);
  $('#magic-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const email = String(new FormData(ev.target).get('email') || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { renderMagic(message, 'Adresse e-mail invalide.'); return; }
    const btn = $('#magic-submit');
    btn.disabled = true; btn.textContent = 'Envoi…';
    try {
      await api.sendMagicLink(email);
      openSheet('auth', `<div class="result"><div style="font-size:40px">📬</div><h2>Regarde tes e-mails</h2><p>Un lien de connexion a été envoyé à <strong>${esc(email)}</strong>. Ouvre-le sur ce téléphone.</p></div><button class="btn btn-dark" id="btn-ok">OK</button>`);
      $('#btn-ok').onclick = closeSheet;
    } catch (err) { renderMagic(message, err.message); }
  };
}

// Compte créé via Google ou le lien e-mail : pseudo automatique « Membre… » à personnaliser.
const isAutoPseudo = (p) => /^Membre[0-9A-F]{6,}$/i.test(p || '');
function askPseudo() {
  openSheet('pseudo', `
    <div class="sheet-head"><div class="grow"><h2>Choisis ton pseudo</h2><div class="sub">Il s'affiche dans le classement. Tu pourras le changer plus tard.</div></div></div>
    <form id="first-pseudo" novalidate>
      <label class="field"><span>Pseudo (3 à 20 caractères)</span><input name="pseudo" minlength="3" maxlength="20" autocomplete="nickname" required></label>
      <button class="btn btn-primary" type="submit">Valider</button>
    </form>
    <p style="text-align:center;margin:12px 0 0"><button class="link-btn" id="pseudo-later">Plus tard</button></p>`);
  $('#pseudo-later').onclick = closeSheet;
  $('#first-pseudo').onsubmit = async (ev) => {
    ev.preventDefault();
    const v = String(new FormData(ev.target).get('pseudo') || '').trim();
    const r = await api.changePseudo(v).catch((e) => e.message);
    if (r === 'ok') { await refreshProfile(); closeSheet(); toast(`Bienvenue ${v} 👋`); }
    else toast(r === 'Pseudo deja pris' ? 'Ce pseudo est déjà pris.' : r === 'Le pseudo doit faire 3 a 20 caracteres' ? 'Le pseudo doit faire de 3 à 20 caractères.' : r);
  };
}

// Parrainage : le code ?p=CODE est gardé jusqu'à ce que le filleul ait un compte.
const REF_KEY = 'ydp_ref';
{
  const p = new URLSearchParams(location.search).get('p');
  if (p && /^[A-Za-z0-9]{4,12}$/.test(p)) store.set(REF_KEY, p.toUpperCase());
}
async function applyPendingReferral() {
  const code = store.get(REF_KEY);
  if (!code || !state.user) return;
  if (state.profile?.ref_code === code) { store.set(REF_KEY, null); return; }
  if (state.profile && !state.profile.can_set_referrer) { store.set(REF_KEY, null); return; }
  try {
    const r = await api.setReferrer(code);
    store.set(REF_KEY, null);
    if (r?.ok) { toast(`Parrainé par ${r.parrain} 🎉 Ton 1er signalement vous rapporte des points à tous les deux.`, 5000); refreshProfile(); }
  } catch {}
}

let wantedPseudo = null;

async function refreshProfile() {
  if (!state.user) { state.profile = null; return; }
  try { state.profile = await api.myProfile(); } catch {}
  checkNewBadges();
}

// Animation « Nouveau badge » : compare les badges du profil à ceux déjà vus sur ce téléphone.
// Plusieurs badges gagnés d'un coup → affichés l'un après l'autre.
const badgeQueue = [];
function checkNewBadges() {
  const uid = state.user?.id, list = state.profile?.badges;
  if (!uid || !Array.isArray(list)) return;
  const key = `ydp_seen_badges_${uid}`;
  const raw = store.get(key);
  if (raw == null) { store.set(key, JSON.stringify(list)); return; } // 1re fois sur ce téléphone : rien à fêter
  let seen; try { seen = JSON.parse(raw) || []; } catch { seen = []; }
  const fresh = list.filter((b) => !seen.includes(b) && !badgeQueue.includes(b));
  if (!fresh.length) return;
  store.set(key, JSON.stringify([...new Set([...seen, ...fresh])]));
  const wasIdle = !badgeQueue.length;
  badgeQueue.push(...fresh);
  if (wasIdle) setTimeout(showNextBadge, 700);
}
function showNextBadge() {
  const code = badgeQueue[0];
  if (!code) return;
  const left = badgeQueue.length - 1;
  const el = document.createElement('div');
  el.className = 'badge-pop';
  el.innerHTML = `
    <div class="bp-card" role="dialog" aria-label="Nouveau badge">
      <div class="bp-rays"></div>
      <div class="bp-confetti">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <div class="bp-kicker">Nouveau badge débloqué !</div>
      <div class="bp-img">${badgeImg(code)}</div>
      <div class="bp-name">${esc(BADGE_NAMES[code] || code)}</div>
      <div class="bp-sub">Retrouve-le dans Profil › Badges.</div>
      <button type="button" class="btn btn-primary bp-btn">${left ? `Suivant (encore ${left})` : 'Super !'}</button>
    </div>`;
  document.body.appendChild(el);
  try { navigator.vibrate?.([60, 40, 120]); } catch {}
  requestAnimationFrame(() => el.classList.add('show'));
  const next = () => {
    el.classList.remove('show'); el.classList.add('hide');
    setTimeout(() => { el.remove(); badgeQueue.shift(); if (badgeQueue.length) showNextBadge(); }, 260);
  };
  $('.bp-btn', el).onclick = next;
  el.onclick = (ev) => { if (ev.target === el) next(); };
}

async function loadFavorites() {
  state.favorites.clear();
  if (!state.user) return;
  try { (await api.myFavorites() || []).forEach((e) => state.favorites.add(e.id)); } catch {}
}

// Onglets du compte : on affiche tout de suite ce qu'on a déjà (profil, badges, classement gardés en mémoire)
// et on met à jour en arrière-plan ; seul le tout premier affichage attend le réseau.
const acctCache = { badges: null, rank: {}, podium: null, fav: null };
let acctSeq = 0;
// Images des badges, avatars et rubans téléchargées à l'avance (une fois) : Badges et Personnaliser s'affichent d'un coup.
const preloaded = [];
let imagesPreloaded = false;
function preloadAccountImages() {
  if (imagesPreloaded) return;
  imagesPreloaded = true;
  const urls = new Set([...BADGE_ART].map((c) => `icons/badges/${c}.webp?v=214`));
  custom.load().then((list) => {
    (list || []).forEach((c) => { if (/\.(webp|png|svg)$/.test(c.value || '')) urls.add(`${c.value}?v=214`); });
  }).catch(() => {}).finally(() => {
    const go = () => urls.forEach((u) => { const im = new Image(); im.decoding = 'async'; im.src = u; im.decode?.().catch(() => {}); preloaded.push(im); });
    (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(go);
  });
}
function prefetchAccount() {
  if (!state.user) return;
  preloadAccountImages();
  api.badgesProgress().then((r) => { acctCache.badges = r || []; }).catch(() => {});
  api.ranking('month', null).then((r) => { acctCache.rank.month = r || []; }).catch(() => {});
  api.lastMonthPodium().then((r) => { acctCache.podium = r || []; }).catch(() => {});
  api.myFavorites().then((r) => { acctCache.fav = r || []; }).catch(() => {});
}
async function renderAccount(tab = 'profil', opts = {}) {
  const seq = ++acctSeq;
  if (!custom.list.length) await custom.load();
  if (!state.profile) await refreshProfile();
  else if (!opts.fresh) {
    const before = JSON.stringify(state.profile);
    refreshProfile().then(() => {
      if (seq === acctSeq && JSON.stringify(state.profile) !== before && state.sheetView === 'account' && !$('#sheet').hidden && tab === 'profil') renderAccount(tab, { fresh: true });
    });
  }
  if (!opts.fresh && tab === 'profil') prefetchAccount();
  const p = state.profile || { pseudo: '…', points: 0, level_name: '', next_level_at: null };
  const pct = p.next_level_at ? Math.min(100, Math.round((p.points / p.next_level_at) * 100)) : 100;
  openSheet('account', `
    <div class="sheet-head">
      <div class="grow"><h2>${tab === 'reglages' ? 'Réglages' : 'Mon compte'}</h2></div>
      ${isTester() ? '<button class="round-btn" id="btn-test" aria-label="Mode test">🧪</button>' : ''}
      <button class="round-btn" id="btn-custom" aria-label="Personnaliser mon image et mon ruban">🎨</button>
      <button class="round-btn ${tab === 'reglages' ? 'on' : ''}" id="btn-settings" aria-label="Réglages">⚙️</button>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <div class="tabs" role="tablist">
      ${[['profil', 'Mon profil'], ['badges', 'Badges'], ['classement', 'Classement'], ['favoris', 'Favoris']]
        .map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    ${tab === 'profil' ? `
    <div class="beta-slot"></div>
    <div class="profile-card">
      <div class="profile-head">
        <button class="avatar" id="btn-avatar" aria-label="Personnaliser mon profil">${custom.avatar(p.avatar) || esc((p.pseudo || '?').slice(0, 1).toUpperCase())}</button>
        ${custom.ribbon(p.banner, p.pseudo)}
        <div class="lvl">Niveau ${p.level ?? 1} · ${esc(p.level_name)}</div>
        ${p.member_since ? `<div class="since">Membre depuis ${memberSince(p.member_since)}</div>` : ''}
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <small>${p.points} points${p.next_level_at ? ` · encore ${p.next_level_at - p.points} pour le niveau suivant` : ' · niveau maximum 🎉'}</small>
      <div class="stats">
        <div><strong>${p.reports_total ?? 0}</strong><span>signalements</span></div>
        <div><strong>${p.restos_total ?? 0}</strong><span>restos</span></div>
        <div><strong>${(p.badges || []).length}</strong><span>badges</span></div>
      </div>
      ${p.top_resto ? `<div class="top-resto"><span class="star">⭐</span><div>Ton resto le plus signalé :<br><strong>${esc(p.top_resto)}</strong></div></div>` : ''}
    </div>
    <div class="referral">
      <div class="ref-head">
        <img class="ref-ico" src="icons/badges/ref1.webp?v=214" alt="">
        <div class="grow"><div class="t">Parrainage</div><div class="s">Invite tes amis : vous gagnez tous les deux.</div></div>
        <span class="ref-count"><b>${p.referrals ?? 0}</b>${(p.referrals ?? 0) > 1 ? 'amis' : 'ami'}</span>
      </div>
      <div class="ref-gifts"><div><b>+20 pts</b><span>pour toi</span></div><div><b>+10 pts</b><span>pour ton ami</span></div></div>
      <div class="ref-note"><u>Dès son 1er signalement</u>.${p.referrals_pending ? ` · ${p.referrals_pending} en attente` : ''}${p.parrain ? `<br>Ton parrain : <strong>${esc(p.parrain)}</strong>` : ''}</div>
      ${p.can_set_referrer && !p.parrain ? `<form id="ref-form" class="ref-form"><input name="code" placeholder="Code d'un parrain" maxlength="12" autocomplete="off"><button class="btn btn-dark">OK</button></form>` : ''}
      <button class="btn btn-primary ref-btn" id="btn-refer">Inviter des amis</button>
    </div>` : ''}
    <div id="tab-body">${tab === 'profil' ? '' : '<div class="spinner"></div>'}</div>
  `);
  $('#btn-close').onclick = closeSheet;
  fillBeta($('#sheet-body'));
  $('#btn-settings').onclick = () => renderAccount(tab === 'reglages' ? 'profil' : 'reglages');
  const on = (sel, fn) => { const el = document.querySelector(sel); if (el) el.onclick = fn; };
  on('#btn-custom', () => openCustomize());
  on('#btn-test', () => openTestTools());
  on('#btn-avatar', () => openCustomize());
  on('#btn-refer', () => openShare());
  const rf = document.querySelector('#ref-form');
  if (rf) rf.onsubmit = async (ev) => {
    ev.preventDefault();
    const code = String(new FormData(rf).get('code') || '').trim();
    if (!code) return;
    const r = await api.setReferrer(code).catch((e) => ({ ok: false, message: e.message }));
    if (r?.ok) { toast(`Parrainé par ${r.parrain} 🎉`); renderAccount(tab); }
    else toast(r?.message || 'Code refusé.');
  };
  $('#sheet-body').querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => renderAccount(b.dataset.tab));
  const body = $('#tab-body');
  try {
    if (tab === 'badges') {
      if (acctCache.badges) body.innerHTML = badgesHtml(acctCache.badges);
      const rows = await api.badgesProgress() || [];
      const changed = JSON.stringify(rows) !== JSON.stringify(acctCache.badges);
      acctCache.badges = rows;
      if (seq === acctSeq && (changed || !body.innerHTML.trim() || body.querySelector('.spinner'))) { const y = $('#sheet-body')?.scrollTop; body.innerHTML = badgesHtml(rows); if (y != null) $('#sheet-body').scrollTop = y; }
    }
    if (tab === 'classement') { await renderLeaderboard(body); return; }
    if (tab === 'favoris') {
      if (acctCache.fav) { body.innerHTML = await favoritesHtml(true); bindFavList(body); }
      const prev = JSON.stringify(acctCache.fav);
      const html = await favoritesHtml();
      if (seq === acctSeq && JSON.stringify(acctCache.fav) !== prev) { body.innerHTML = html; bindFavList(body); }
    }
    if (tab === 'reglages') { const resto = await api.myRestaurant().catch(() => null); body.innerHTML = settingsHtml(resto); bindSettings(body, resto); }
  } catch (err) {
    body.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

// Personnalisation : avatars et bannières proposés par l'appli, débloqués en montant de niveau (la base contrôle).
const custom = {
  list: [],
  async load() { if (!this.list.length) this.list = await api.customizations() || []; return this.list; },
  find(kind, code) { return this.list.find((c) => c.kind === kind && c.code === code); },
  // Valeur = fichier image de l'appli (icons/avatars/…svg, icons/banners/…svg) ; ancien format emoji/dégradé toléré.
  img(v, cls = '') { return /\.(webp|png|svg)$/.test(v || '') ? `<img src="${v}?v=214" alt="" class="${cls}">` : (v || ''); },
  bg(v) { return /\.(webp|png|svg)$/.test(v || '') ? `url(${v}?v=214) center/cover` : v; },
  avatar(code) { return this.img(this.find('avatar', code)?.value, 'avatar-img' + (String(code).startsWith('badge_') ? ' is-badge' : '')); },
  // Bannière = ruban qui porte le pseudo (rubans du 16/11/2026, outils/rubans_sheet2.py, découpés tels quels).
  // Pseudo : centré sur la bande de chaque ruban (hauteur mesurée) + contour de la couleur du ruban, foncée.
  RIB: { ruban_ciel: ['42%', '#1c4e7f'], ruban_bonbon: ['42%', '#7a1f55'], ruban_turquoise: ['42%', '#0f5145'], ruban_orange: ['42%', '#7a3a00'], ruban_violet: ['42%', '#3d1466'], ruban_laurier: ['42%', '#1e5a4c'], ruban_nuit: ['42%', '#04203f'], ruban_vache: ['42%', '#5a3418'], ruban_damier: ['42%', '#111111'], ruban_flammes: ['42%', '#4a0a05'], ruban_vert: ['47%', '#1f5a0f'], ruban_fleurs: ['54%', '#245c0b'], ruban_coeur: ['59%', '#7d0f45'], ruban_flocon: ['60%', '#0b3a7a'], ruban_engrenage: ['58%', '#064450'], ruban_etoile_or: ['57%', '#6e3300'], ruban_diamant: ['61%', '#0a2f6e'], ruban_flamme_violet: ['58%', '#2e0a52'], ruban_etoile_violet: ['57%', '#3a0b5c'], ruban_couronne: ['56%', '#5a0606'] },
  ribbon(code, pseudo) {
    const b = this.find('banner', code) || this.list.find((c) => c.kind === 'banner');
    const [ty, tc] = this.RIB[b?.code] || ['46%', '#0B1F3A'];
    return `<div class="ribbon" style="--ty:${ty};--tc:${tc};--n:${Math.max(8, [...String(pseudo || '')].length)}">${b ? `<img src="${b.value}?v=214" alt="">` : ''}<span>${esc(pseudo || '')}</span></div>`;
  },
};
async function openCustomize() {
  await custom.load();
  const p = state.profile || {};
  const lvl = p.level || 1;
  const mine = new Set((p.badges || []).map((b) => (typeof b === 'string' ? b : b.code)));
  const cell = (c) => {
    const needBadge = c.requires_badge && !mine.has(c.requires_badge);
    const locked = lvl < c.min_level || needBadge;
    const on = (c.kind === 'avatar' ? p.avatar : p.banner) === c.code;
    const inner = c.kind === 'avatar' ? `<span class="cz-emoji">${custom.img(c.value, 'cz-img')}</span>` : `<span class="cz-ribbon"><img src="${c.value}?v=214" alt=""></span>`;
    const label = c.requires_badge ? (needBadge ? '🔒' : '✅') : `${locked ? '🔒 ' : ''}Niv. ${c.min_level}`;
    return `<button type="button" class="cz ${on ? 'on' : ''} ${locked ? 'locked' : ''}" data-kind="${c.kind}" data-code="${c.code}" ${locked ? 'disabled' : ''}>
      ${inner}<span class="cz-lock">${esc(label)}</span></button>`;
  };
  const avatars = custom.list.filter((c) => c.kind === 'avatar' && !c.requires_badge);
  const badgeAv = custom.list.filter((c) => c.kind === 'avatar' && c.requires_badge)
    .sort((a, b) => (mine.has(b.requires_badge) - mine.has(a.requires_badge)));
  openSheet('custom', `
    <div class="sheet-head">
      <button class="round-btn" id="btn-back" aria-label="Retour">${ICON.back}</button>
      <div class="grow"><h2>Personnaliser mon profil</h2><div class="sub">Niveau ${lvl} · rubans et images se débloquent en montant de niveau, et avec tes badges.</div></div>
    </div>
    <div class="section-title">Ruban (porte ton pseudo)</div>
    <div class="cz-grid banners">${custom.list.filter((c) => c.kind === 'banner').map(cell).join('')}</div>
    <div class="section-title">Image de profil</div>
    <div class="cz-grid avatars">${avatars.map(cell).join('')}</div>
    ${badgeAv.length ? `<div class="section-title">Mes badges en image de profil</div>
    <p class="muted" style="font-size:12.5px;margin:-4px 0 8px">Chaque badge gagné peut devenir ton image de profil.</p>
    <div class="cz-grid avatars">${badgeAv.map(cell).join('')}</div>` : ''}`);
  $('#btn-back').onclick = () => renderAccount('profil');
  $('#sheet-body').querySelectorAll('.cz:not(.locked)').forEach((b) => b.onclick = async () => {
    // Le choix est mis en avant sur place : la page ne bouge pas (plus de retour en haut).
    const same = [...$('#sheet-body').querySelectorAll(`.cz[data-kind="${b.dataset.kind}"]`)];
    const prev = same.find((x) => x.classList.contains('on'));
    if (prev === b) return;
    same.forEach((x) => x.classList.toggle('on', x === b));
    const r = await api.setCustomization(b.dataset.kind, b.dataset.code).catch((e) => ({ ok: false, message: e.message }));
    if (!r?.ok) { same.forEach((x) => x.classList.toggle('on', x === prev)); toast(r?.message || 'Impossible pour le moment.'); return; }
    await refreshProfile();
  });
}

const memberSince = (d) => new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

// Profil public d'un autre joueur (depuis le classement) : aucune info de contact, aucun lieu.
async function openPublicProfile(pseudo, back) {
  await custom.load();
  openSheet('public', '<div class="spinner"></div>');
  const p = await api.publicProfile(pseudo).catch(() => null);
  if (!p) { toast('Profil introuvable.'); back(); return; }
  openSheet('public', `
    <div class="sheet-head">
      <button class="round-btn" id="btn-back" aria-label="Retour">${ICON.back}</button>
      <div class="grow"><h2>Profil</h2></div>
    </div>
    <div class="profile-card">
      <div class="profile-head">
        <span class="avatar">${custom.avatar(p.avatar)}</span>
        ${custom.ribbon(p.banner, p.pseudo)}
        <div class="lvl">Niveau ${p.level} · ${esc(p.level_name)}</div>
        <div class="since">Membre depuis ${memberSince(p.member_since)}</div>
      </div>
      <div class="stats">
        <div><strong>${p.points}</strong><span>points</span></div>
        <div><strong>${p.reports_total}</strong><span>signalements</span></div>
        <div><strong>${p.restos_total}</strong><span>restos</span></div>
      </div>
    </div>
    <div class="section-title">Badges (${p.badges.length})</div>
    ${p.badges.length ? `<div class="pub-badges">${p.badges.map((b) => `<span class="pub-badge">${badgeImg(b.code)} ${esc(b.name)}</span>`).join('')}</div>` : '<p class="muted">Pas encore de badge.</p>'}`);
  $('#btn-back').onclick = back;
}

// Badges rangés par catégorie ; les badges pas encore disponibles tout en bas.
const BADGE_FAMILIES = [
  ['Spécial', 'Spécial'], ['Volume', 'Signalements'], ['Variété', 'Exploration'], ['Parrainage', 'Parrainage'],
  ['Moments', 'Moments'], ['Fiabilité', 'Fiabilité'],
];
const BADGE_ICONS = {
  v1: '📍', v10: '🖐️', v50: '🔟', v100: '🥉', v250: '🥈', v500: '🥇',
  drive10: '🚗', explorer: '🧭', explorer10: '🍽️', explorer15: '🗺️', explorer20: '🛣️', explorer30: '✈️', tour_zone: '🗺️', tour_zone6: '✈️', tour_zone10: '🌍', testeur: '🧪',
  ref1: '🤝', ref10: '📣', ref30: '👑',
  coup_de_feu: '🛡️', regulier: '📅', regulier8: '📅', regulier12: '📅', fiable: '⚡', oeil_lynx: '🦉',
};
// Illustrations des badges (icons/badges/*.webp, images ChatGPT d'Alexis) ; emoji en secours pour un badge sans image.
const BADGE_ART = new Set(['v1', 'v10', 'v50', 'v100', 'v250', 'v500', 'drive10', 'explorer', 'explorer10', 'explorer15', 'explorer20', 'explorer30', 'tour_zone', 'tour_zone6', 'tour_zone10', 'testeur', 'ref1', 'ref10', 'ref30', 'coup_de_feu', 'regulier', 'regulier8', 'regulier12', 'fiable', 'oeil_lynx']);
// Badges en .svg : plus aucun (outils/badges_sheet.py et badges_sheet2.py découpent les images ChatGPT).
const BADGE_SVG = new Set(); // tous les badges sont maintenant des images ChatGPT (.webp)
const badgeImg = (code) => BADGE_ART.has(code)
  ? `<img src="icons/badges/${code}.${BADGE_SVG.has(code) ? 'svg' : 'webp'}?v=214" alt="" class="badge-img">`
  : `<span class="badge-emoji">${BADGE_ICONS[code] || '🏅'}</span>`;
function badgesHtml(rows = []) {
  if (!rows.length) return '<p class="muted">Aucun badge pour le moment.</p>';
  const item = (b) => {
    const prog = b.is_active && b.target_value ? Math.round((b.current_value / b.target_value) * 100) : 0;
    const sub = !b.is_active ? 'Bientôt disponible' : b.earned ? '✅' : `${b.current_value} / ${b.target_value}`;
    return `<li class="${b.is_active ? '' : 'locked'}">
      <span class="badge-art ${b.earned ? 'on' : ''}">${badgeImg(b.code)}${b.is_active ? '' : '<span class="badge-lock">🔒</span>'}</span>
      <div class="grow"><div class="t">${esc(b.name)}</div><div class="s">${esc(b.description)} · ${sub}</div>
      ${b.is_active && !b.earned ? `<div class="mini-progress"><div style="width:${prog}%"></div></div>` : ''}</div>
    </li>`;
  };
  const known = BADGE_FAMILIES.map(([f]) => f);
  const fams = [...BADGE_FAMILIES, ...[...new Set(rows.map((b) => b.family))].filter((f) => !known.includes(f)).map((f) => [f, f])];
  const active = rows.filter((b) => b.is_active);
  const locked = rows.filter((b) => !b.is_active);
  let html = '<div class="badge-rule rule-grid"><span>🏅</span><span>+1 point par badge</span><span>🎉</span><span>+10 points par catégorie complète</span></div>';
  for (const [fam, label] of fams) {
    const list = active.filter((b) => b.family === fam).sort((a, b2) => (b2.earned - a.earned));
    if (!list.length) continue;
    const got = list.filter((b) => b.earned).length;
    html += `<div class="badge-fam"><span>${esc(label)}</span><small>${got === list.length ? '✅ +10 pts · ' : ''}${got}/${list.length}</small></div><ul class="list">${list.map(item).join('')}</ul>`;
  }
  if (locked.length) html += `<div class="badge-fam muted-fam"><span>Bientôt disponibles</span></div><ul class="list">${locked.map(item).join('')}</ul>`;
  return html;
}

// Classements : « Ce mois-ci » (remis à zéro le 1er du mois) et « Depuis le début ».
// Bandeau « Version test » : affiché tant que la base dit beta_open (retiré au lancement).
let betaFlag = null;
function fillBeta(root) {
  const slots = (root || document).querySelectorAll('.beta-slot');
  if (!slots.length) return;
  const put = () => slots.forEach((el) => { el.innerHTML = betaFlag ? `<div class="prize prize-beta"><span class="prize-ico">🧪</span><div><div class="prize-t">Version test</div><div class="prize-s">Tes points et badges seront remis à zéro au lancement. Un badge spécial sera réservé aux testeurs, gardé à vie.</div></div></div>` : ''; });
  if (betaFlag !== null) return put();
  api.appFlags().then((f) => { betaFlag = !!f?.beta_open; put(); }).catch(() => {});
}

async function renderLeaderboard(body, city = null, scope = 'month') {
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'Europe/Paris' }).format(new Date());
  body.innerHTML = `
    <div class="seg">
      <button data-scope="month" class="${scope === 'month' ? 'on' : ''}">Ce mois-ci</button>
      <button data-scope="all" class="${scope === 'all' ? 'on' : ''}">Depuis le début</button>
    </div>
    <p class="muted" style="font-size:12.5px;margin:2px 0 8px">${scope === 'month'
      ? `Points gagnés en ${month}. Le classement repart de zéro le 1er de chaque mois.`
      : 'Tous les points gagnés depuis l\'inscription.'}</p>
    <div id="lb-prize"><div class="prize prize-soon"><span class="prize-ico">🎁</span><div><div class="prize-t">Des récompenses arrivent bientôt</div>
      <div class="prize-s">Les meilleurs du classement gagneront des cadeaux offerts par nos restos partenaires. Tes points comptent déjà : continue à signaler !</div></div></div></div>
    <div id="lb-podium"></div>
    <div id="lb-list"><div class="spinner"></div></div>`;
  fillBeta(body);
  // Podium du mois dernier (rien s'il n'y a eu personne).
  const drawPodium = (rows) => {
    const box = document.querySelector('#lb-podium');
    if (!box || !rows?.length) return;
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const m = MOIS[Number(String(rows[0].mois || '').slice(5, 7)) - 1] || 'le mois dernier';
    const order = [rows[1], rows[0], rows[2]].filter(Boolean);
    box.innerHTML = `<div class="podium"><div class="podium-t">🏆 Podium de ${m}</div><div class="podium-row">${order.map((r) => `
      <button type="button" class="pod pod-${r.rang}" data-pseudo="${esc(r.pseudo)}">
        <span class="pod-medal">${['🥇', '🥈', '🥉'][r.rang - 1]}</span>
        <span class="lb-av pod-av">${custom.avatar(r.avatar)}</span>
        <span class="pod-name">${esc(r.pseudo)}</span><span class="pod-pts">${r.points} pts</span>
        <span class="pod-step">${r.rang}</span></button>`).join('')}</div></div>`;
    box.querySelectorAll('.pod').forEach((b) => b.onclick = () => openPublicProfile(b.dataset.pseudo, () => renderAccount('classement')));
  };
  if (scope === 'month') {
    if (acctCache.podium) drawPodium(acctCache.podium);
    api.lastMonthPodium().then((rows) => { if (JSON.stringify(rows) !== JSON.stringify(acctCache.podium)) { acctCache.podium = rows; drawPodium(rows); } }).catch(() => {});
  }
  // Lot du mois offert par un partenaire (rien ne s'affiche s'il n'y en a pas).
  if (scope === 'month') api.monthlyPrize().then((pz) => {
    const box = document.querySelector('#lb-prize');
    if (!pz || !box) return;
    const e = pz.establishment_id ? state.establishments.get(pz.establishment_id) : null;
    box.innerHTML = `<div class="prize"><span class="prize-ico">🏆</span><div><div class="prize-t">Lot du mois : ${esc(pz.title)}</div>
      <div class="prize-s">Pour ${pz.winners > 1 ? `les ${pz.winners} premiers` : 'le n°1'} du classement de ${month}${pz.sponsor_name ? `, offert par <strong>${esc(pz.sponsor_name)}</strong>` : ''}${e ? ' · <button type="button" class="link-btn" id="prize-resto">voir le resto</button>' : ''}</div></div></div>`;
    const b = document.querySelector('#prize-resto');
    if (b) b.onclick = () => { closeSheet(); openDetail(e.id); };
  }).catch(() => {});
  // Classement général uniquement (plus de filtre par ville) ; par région plus tard si l'appli s'étend.
  body.querySelectorAll('[data-scope]').forEach((b) => b.onclick = () => renderLeaderboard(body, null, b.dataset.scope));
  const drawRank = (rows) => {
  if (!$('#lb-list')) return;
  $('#lb-list').innerHTML = rows.length ? `<ul class="list">${rows.map((r) => `
    <li class="${r.is_me ? 'me-row' : ''} lb-row" data-pseudo="${esc(r.pseudo)}" role="button" tabindex="0">
    <span class="rank">${r.rang <= 3 ? ['🥇', '🥈', '🥉'][r.rang - 1] : r.rang}</span>
    <span class="lb-av">${custom.avatar(r.avatar)}</span>
    <div class="grow"><div class="t">${esc(r.pseudo)}${r.is_me ? ' (moi)' : ''}</div></div><strong>${r.points} pts</strong></li>`).join('')}</ul>`
    : '<p class="muted">Personne n\'a encore gagné de points sur cette période. À toi de jouer !</p>';
  // Dernière ligne : ma place (même hors des 100 premiers).
  const me = rows.find((r) => r.is_me);
  const ord = (n) => (n === 1 ? '1er' : `${Number(n).toLocaleString('fr-FR')}e`);
  if (state.user) myRankBar(me
    ? `<span class="lb-av">${custom.avatar(me.avatar)}</span><div class="grow"><div class="t">${esc(me.pseudo)}</div><div class="s">${me.points} pts</div></div><span class="lb-me-rank">${ord(me.rang)}</span>`
    : '<div class="grow"><div class="t">Pas encore classé</div><div class="s">Fais un signalement pour entrer dans le classement !</div></div>');
  $('#lb-list').querySelectorAll('.lb-row').forEach((li) => li.onclick = () => openPublicProfile(li.dataset.pseudo, () => renderAccount('classement')));
  };
  const key = scope + '|' + (city || '');
  if (acctCache.rank[key] || (!city && acctCache.rank[scope])) drawRank(acctCache.rank[key] || acctCache.rank[scope]);
  const rows = await api.ranking(scope, city) || [];
  if (JSON.stringify(rows) !== JSON.stringify(acctCache.rank[key] || (!city && acctCache.rank[scope]))) drawRank(rows);
  acctCache.rank[key] = rows; if (!city) acctCache.rank[scope] = rows;
}

async function favoritesHtml(cached = false) {
  const rows = cached ? acctCache.fav : (acctCache.fav = await api.myFavorites() || []);
  state.favorites = new Set(rows.map((r) => r.id));
  if (!rows.length) return '<p class="muted">Aucun favori. Touche l\'étoile ⭐ sur la fiche d\'un restaurant pour l\'ajouter.</p>';
  return `<ul class="list">${rows.map((r) => {
    const e = state.establishments.get(r.id) || r;
    const st = describeStatus(mainStatus(e));
    return `<li data-id="${r.id}" style="cursor:pointer">
      <span class="badge-ico" style="background:${st.info.soft}"><span style="width:12px;height:12px;border-radius:50%;background:${st.info.color}"></span></span>
      <div class="grow"><div class="t">${esc(r.name)}</div><div class="s">${esc(r.city)} · ${esc(st.info.label)}</div></div></li>`;
  }).join('')}</ul>`;
}
function bindFavList(body) {
  body.querySelectorAll('li[data-id]').forEach((li) => li.onclick = () => {
    openDetail(li.dataset.id);
  });
}

// Espace du restaurateur partenaire : ses chiffres (30 jours) et son offre du jour.
function myRestoHtml(r) {
  const o = r.offer;
  const hours = (r.busiest || []).map((h) => `${h} h`).join(', ');
  return `
    <div class="partner-card mine">
      <div class="pc-head"><span class="pc-ico">🏪</span><div><div class="pc-title">${esc(r.name)}</div><div class="pc-sub">⭐ Partenaire${r.founder ? ' fondateur' : ''}</div></div></div>
      <div class="pc-stats">
        <div><strong>${r.views_30d ?? 0}</strong><span>vues de la fiche</span></div>
        <div><strong>${r.clicks_30d ?? 0}</strong><span>clics lien / tél.</span></div>
        <div><strong>${r.reports_30d ?? 0}</strong><span>signalements</span></div>
        <div><strong>${r.favorites ?? 0}</strong><span>en favori</span></div>
      </div>
      <div class="pc-note" style="text-align:left">Sur 30 jours${hours ? ` · heures les plus chargées : <strong>${hours}</strong>` : ''}</div>
      <a class="btn btn-ghost pc-poster" href="affiche.html?r=${encodeURIComponent(r.id)}" target="_blank" rel="noopener">🖨️ Mon affiche QR code à poser en caisse</a>
      <div class="pc-offer">
        <div class="pc-offer-t">🎁 Offre du jour</div>
        ${o ? `<div class="pc-current"><strong>${esc(o.title)}</strong>${o.details ? `<br>${esc(o.details)}` : ''}<br><small>${o.visible ? '🟢 Visible en ce moment' : '⏸️ En pause : visible seulement quand c\'est calme'} · ${offerEnd(o.ends_at)}</small></div>` : '<div class="pc-current"><small>Aucune offre en cours.</small></div>'}
        <form id="offer-form">
          <input class="select" name="title" placeholder="Ex. : -10 % sur le menu" maxlength="60" required minlength="3">
          <input class="select" name="details" placeholder="Détail (facultatif)" maxlength="140">
          <select class="select" name="hours">
            <option value="3">Pendant 3 heures</option>
            <option value="24" selected>Pendant 24 heures</option>
            <option value="72">Pendant 3 jours</option>
            <option value="168">Pendant 7 jours</option>
          </select>
          <label class="pc-check"><input type="checkbox" name="calm"> Afficher seulement quand c'est calme chez moi</label>
          <button class="btn btn-primary">Publier l'offre</button>
        </form>
        ${o ? '<button type="button" class="link-btn" id="offer-clear" style="color:#fff">Retirer l\'offre en cours</button>' : ''}
      </div>
      <div class="pc-note">Les statuts d'affluence restent toujours neutres : un partenariat ne les modifie jamais.</div>
    </div>`;
}

function settingsHtml(resto = null) {
  return `
    <div class="set-pseudo">
      <span class="set-av">${custom.avatar(state.profile?.avatar) || ''}</span>
      <div class="grow"><div class="lbl">Ton pseudo</div><div class="val">${esc(state.profile?.pseudo || '')}</div></div>
      <button type="button" class="set-edit" id="btn-pseudo">✏️ Modifier</button>
    </div>

    ${canInstall() ? `<div class="set-card">
      <div class="set-block"><span class="set-big">📲</span><div class="grow"><div class="t">L'appli sur ton écran d'accueil</div><div class="s">Ouvre Y'a du peuple ? en un clic, comme une vraie appli.</div></div></div>
      <button type="button" class="btn btn-primary" id="btn-install">Installer l'appli</button>
    </div>` : ''}
    ${pushCardHtml()}
    <div class="set-card">
      <div class="set-block"><span class="set-big">💬</span><div class="grow"><div class="t">Ton avis compte</div><div class="s">L'appli est en test : une idée, un bug ? Dis-le-nous.</div></div></div>
      <button type="button" class="btn btn-primary" id="btn-feedback">Donner mon avis</button>
    </div>

<div class="set-resto">
    ${resto ? myRestoHtml(resto) : `<details class="partner-card pc-fold">
      <summary class="pc-head"><span class="pc-ico">🍔</span><div class="grow"><div class="pc-title">Vous êtes restaurateur ?</div><div class="pc-sub">Devenez partenaire de Y'a du peuple ?</div></div><span class="pc-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span></summary>
      <ul class="pc-list">
        <li>⭐ Fiche Pro : badge Partenaire, lien vers votre menu, téléphone</li>
        <li>🎁 Offre du jour sur la carte, même réservée à vos heures creuses</li>
        <li>📊 Vos chiffres : vues, clics, heures de pointe</li>
        <li>🖨️ Une affiche QR code pour votre caisse ou votre Drive</li>
      </ul>
      <div class="pc-launch">🚀 <strong>Offre de lancement</strong> : 3 mois offerts aux 10 premiers partenaires, avec le badge « Partenaire fondateur » à vie.</div>
      <a class="btn btn-primary" href="mailto:${CONTACT_EMAIL}?subject=Partenariat%20Y'a%20du%20peuple">✉️ Nous contacter</a>
      <div class="pc-note">Les statuts d'affluence restent toujours neutres : un partenariat ne les modifie jamais.</div>
    </details>`}
    </div>
    <button class="btn btn-ghost" id="btn-logout">Se déconnecter</button>
    <button class="btn btn-danger" id="btn-delete">Supprimer mon compte</button>
    <div id="delete-box"></div>
    <div class="legal-foot">
      <div class="legal-grid">
        <button type="button" class="link-btn" id="btn-export">Télécharger mes données</button><span>·</span><a class="link-btn" href="confidentialite.html">Règles de confidentialité</a>
        <a class="link-btn" href="cgu.html">Conditions d'utilisation</a><span>·</span><a class="link-btn" href="mentions-legales.html">Mentions légales</a>
      </div>
      <div class="legal-small">Tes données (pseudo, signalements, badges, favoris) t'appartiennent : tu peux les récupérer ou supprimer ton compte à tout moment.</div>
    </div>
  `;
}

function bindSettings(body, resto = null) {
  $('#btn-pseudo', body).onclick = () => openPseudo();
  const ins = $('#btn-install'); if (ins) ins.onclick = installApp;
  const fb = $('#btn-feedback'); if (fb) fb.onclick = () => openFeedback();
  bindPushCard(body);
  const of = $('#offer-form', body);
  if (of) {
    const send = async (o) => {
      const r = await api.setPartnerOffer(o).catch((e) => ({ ok: false, message: e.message }));
      toast(r?.message || 'Impossible pour le moment.');
      if (r?.ok) { await loadPartners(); renderMarkers(); renderCards(); renderAccount('reglages'); }
    };
    of.onsubmit = (ev) => {
      ev.preventDefault();
      const f = new FormData(of);
      send({ title: String(f.get('title') || ''), details: String(f.get('details') || ''), hours: Number(f.get('hours')), onlyWhenCalm: f.get('calm') === 'on' });
    };
    const clr = $('#offer-clear', body);
    if (clr) clr.onclick = () => send({ title: '' });
  }
  $('#btn-export', body).onclick = async () => {
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'yadupeuple-mes-donnees.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Fichier téléchargé');
    } catch (err) { toast(err.message || 'Téléchargement impossible.'); }
  };
  $('#btn-logout', body).onclick = async () => { await api.signOut(); closeSheet(); toast('Déconnecté'); showWelcome(); };
  $('#btn-delete', body).onclick = () => {
    $('#delete-box').innerHTML = `<div class="error-box" style="margin-top:10px">Supprimer définitivement ton compte, tes points et tes badges ? Tes signalements restent, de façon anonyme.</div>
      <button class="btn btn-danger" id="btn-delete-yes">Oui, supprimer définitivement</button>`;
    $('#btn-delete-yes').onclick = async () => {
      const r = await api.deleteMyAccount();
      if (r?.ok) { await api.signOut(); closeSheet(); toast('Compte supprimé'); }
      else toast('Suppression impossible pour le moment.');
    };
  };
}

// Changer de pseudo (petite page à part, ouverte depuis Réglages)
function openPseudo() {
  openSheet('pseudo', `
    <div class="sheet-head">
      <button class="round-btn" id="btn-back" aria-label="Retour">${ICON.back}</button>
      <div class="grow"><h2>Mon pseudo</h2><div class="sub">C'est le nom affiché dans le classement.</div></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <form id="pseudo-form">
      <input class="select" style="width:100%;font-size:17px" name="pseudo" value="${esc(state.profile?.pseudo || '')}" minlength="3" maxlength="20" autocomplete="off">
      <p class="muted" style="font-size:12.5px;margin:6px 0 12px">De 3 à 20 caractères.</p>
      <button class="btn btn-primary">Enregistrer</button>
    </form>`);
  $('#btn-close').onclick = closeSheet;
  $('#btn-back').onclick = () => renderAccount('reglages');
  setTimeout(() => $('#pseudo-form input')?.focus(), 80);
  $('#pseudo-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const v = String(new FormData(ev.target).get('pseudo') || '').trim();
    if (v === state.profile?.pseudo) { renderAccount('reglages'); return; }
    const r = await api.changePseudo(v);
    if (r === 'ok') { toast('Pseudo modifié ✅'); renderAccount('reglages'); }
    else toast(r === 'Pseudo deja pris' ? 'Ce pseudo est déjà pris.' : r === 'Le pseudo doit faire 3 a 20 caracteres' ? 'Le pseudo doit faire de 3 à 20 caractères.' : r);
  };
}

// Outils de test (compte testeur seulement) : position fictive + affiches QR code
function perfHtml() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('ydp_perf') || '[]'); } catch {}
  if (!list.length) return '<p class="muted" style="margin:0 0 8px">Rien encore : ouvre l\'appli quelques fois puis reviens ici.</p>';
  const L = { user: 'compte', style: 'carte', est: 'restos', gps: 'GPS', fly: 'plongée', cards: 'liste', idle: 'tuiles', statuts: 'statuts' };
  const sec = (v) => (v / 1000).toFixed(1).replace('.', ',');
  return '<p class="muted" style="margin:0 0 8px">Secondes depuis l\'ouverture. Tuiles = carte entièrement dessinée.</p>' + list.map((r) => {
    const d = new Date(r.d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const marks = Object.entries(r.t).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${L[k] || k} ${sec(v)}`).join(' · ');
    const tags = [r.sw ? 'cache carte' : 'sans cache carte', r.cached ? 'restos en cache' : 'restos réseau', r.welcome ? 'accueil' : '', r.demo ? 'démo' : '', r.net].filter(Boolean).join(', ');
    return `<div style="margin:0 0 10px;font-size:13px;line-height:1.4"><b>${d}</b> <span class="muted">(${tags})</span><br>${marks}</div>`;
  }).join('');
}
function openTestTools() {
  const t = testPosition();
  openSheet('testtools', `
    <div class="sheet-head">
      <button class="round-btn" id="btn-back" aria-label="Retour">${ICON.back}</button>
      <div class="grow"><h2>Mode test</h2><div class="sub">Visible seulement sur ton compte.</div></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <div class="section-title">Position fictive</div>
    <p class="muted" style="margin:0 0 8px">« latitude, longitude » pour tester sans être sur place. Vide = vrai GPS.</p>
    <form id="test-form" style="display:flex;gap:8px">
      <input class="select" style="flex:1;font-size:16px" name="pos" placeholder="49.3581, 6.1378" value="${t ? `${t.lat}, ${t.lng}` : ''}">
      <button class="btn btn-dark" style="width:auto;padding:10px 16px">OK</button>
    </form>
    <div class="section-title">⏱ Ouvertures récentes</div>
    ${perfHtml()}
    <div class="section-title">Affiches</div>
    <div class="set-list"><a class="set-row" href="affiche.html" target="_blank" rel="noopener"><span class="set-ico">🖨️</span><span class="grow">Affiches QR code des restaurants</span><span class="set-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></span></a></div>`);
  $('#btn-close').onclick = closeSheet;
  $('#btn-back').onclick = () => renderAccount();
  $('#test-form').onsubmit = (ev) => {
    ev.preventDefault();
    const v = String(new FormData(ev.target).get('pos') || '').trim();
    if (!v) { store.set('ydp_test_pos', null); toast('Position de test désactivée'); }
    else {
      const [lat, lng] = v.split(',').map((x) => Number(x.trim()));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { toast('Format attendu : 49.3581, 6.1378'); return; }
      store.set('ydp_test_pos', `${lat},${lng}`);
      toast('Position de test enregistrée');
    }
    renderMe();
    renderCards();
  };
}

// Identifiant anonyme et aléatoire de ce téléphone (aucune info personnelle), gardé dans le navigateur.
function deviceId() {
  let d = store.get('ydp_device');
  if (!d || !/^[A-Za-z0-9_-]{16,64}$/.test(d)) {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    d = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
    store.set('ydp_device', d);
  }
  return d;
}
async function onUserChanged(user) {
  const was = state.user?.id;
  state.user = user;
  if (!user || user.id !== was) { acctCache.badges = null; acctCache.rank = {}; acctCache.podium = null; acctCache.fav = null; }
  $('#btn-account').classList.toggle('logged', !!user);
  if (user && user.id !== was) {
    const fromWelcome = !$('#welcome').hidden;
    $('#welcome').hidden = true;
    if (authInWelcome) welcomeForm(false);
    if (fromWelcome) introFly();
    store.set('ydp_seen_welcome', '1');
    api.registerDevice(deviceId()); // anti-triche parrainage : identifiant anonyme du téléphone
    setTimeout(() => { custom.load().catch(() => {}); prefetchAccount(); }, 2500); // compte prêt avant qu'on l'ouvre
    await Promise.all([refreshProfile(), loadFavorites()]);
    if (wantedPseudo && state.profile && state.profile.pseudo !== wantedPseudo) {
      toast(`Pseudo « ${wantedPseudo} » déjà pris : tu peux le changer dans Réglages.`, 4500);
    }
    wantedPseudo = null;
    applyPendingReferral();
    if (isAutoPseudo(state.profile?.pseudo)) { setTimeout(askPseudo, 600); return; }
    if (state.sheetView === 'auth') {
      const next = afterLogin;
      afterLogin = null;
      if (next) next();
      else { toast(`Bienvenue ${state.profile?.pseudo || ''} 👋`); closeSheet(); }
    }
  }
  if (!user) { state.profile = null; state.favorites.clear(); }
}

// ---------------------------------------------------------------------------
// Écran d'accueil
// ---------------------------------------------------------------------------
const SLOGANS = [
  'Venu pour manger, pas pour poireauter.',
  "Le parking, c'est pas un camping.",
  "J'ai une pause déjeuner, pas un congé sabbatique.",
  'Pas venu pour camper au Drive.',
  'Pas besoin de poser un RTT pour un burger.',
];
// Fond bleu jusqu'en bas de l'écran (barre de navigation du téléphone) tant que l'accueil est affiché.
const syncWelcomeBg = () => document.documentElement.classList.toggle('on-welcome', !$('#welcome').hidden);
new MutationObserver(syncWelcomeBg).observe($('#welcome'), { attributes: true, attributeFilter: ['hidden'] });

function showWelcome() {
  const w = $('#welcome');
  w.hidden = false;
  if (store.get(REF_KEY) && !document.querySelector('.invite-note')) {
    $('.welcome-actions').insertAdjacentHTML('beforebegin', '<p class="invite-note">🎉 Un ami t\'a invité : crée ton compte, ton 1er signalement vous rapporte des points à tous les deux.</p>');
  }
  let i = 0;
  const el = $('#slogan');
  const timer = setInterval(() => {
    if (w.hidden) { clearInterval(timer); return; }
    el.style.opacity = 0;
    setTimeout(() => { i = (i + 1) % SLOGANS.length; el.textContent = SLOGANS[i]; el.style.opacity = 1; }, 350);
  }, 3500);
  $('#welcome-skip').onclick = () => { w.hidden = true; store.set('ydp_seen_welcome', '1'); introFly(); };
  // Connexion ouverte par-dessus l'écran bleu : la carte n'apparaît qu'une fois connecté.
  $('#welcome-login').onclick = () => { welcomeForm(true); openAccount(); };
}

function showCards() {
  mark('cards'); setTimeout(savePerf, 2500);
  introZoom = false;
  document.body.classList.remove('intro');
  renderCards();
  setTimeout(maybeShowTuto, 900);
}

// ---------------------------------------------------------------------------
// Premier lancement guidé (23/11/2026) : 3 écrans, une seule fois par téléphone (localStorage ydp_tuto).
// ---------------------------------------------------------------------------
const TUTO = [
  { icon: '🗺️', title: 'Les couleurs', html: `
    <div class="tuto-levels">
      <span><i style="background:#22C55E"></i>Calme</span>
      <span><i style="background:#EAB308"></i>Un peu de monde</span>
      <span><i style="background:#F97316"></i>Animé</span>
      <span><i style="background:#EF4444"></i>Y'a du peuple !</span>
      <span><i style="background:#9CA3AF"></i>Pas d'info</span>
    </div>
    <p>Chaque fast-food affiche son affluence, salle et Drive séparés. Appuie sur une pastille pour voir le détail.</p>` },
  { icon: '📍', title: 'Signale en 2 secondes', html: `
    <p>Tu es sur place (à moins de 100 m) ? Ouvre la fiche du resto et appuie sur <b>« J'y suis : je signale l'affluence »</b>.</p>
    <p>Ton signalement aide tous ceux qui hésitent à venir.</p>` },
  { icon: '🏆', title: 'Gagne des points', html: `
    <p>Chaque signalement te rapporte des points : monte de niveau, débloque des badges et grimpe au classement du mois.</p>
    <p class="tuto-small">La carte se consulte sans compte. Un compte gratuit sert à signaler.</p>` },
];
function maybeShowTuto() {
  if (store.get('ydp_tuto') || state.sheetView || document.querySelector('.badge-pop, .tuto-pop')) return;
  store.set('ydp_tuto', '1');
  let i = 0;
  const el = document.createElement('div');
  el.className = 'badge-pop tuto-pop';
  const paint = () => {
    const t = TUTO[i];
    el.innerHTML = `
      <div class="bp-card tuto-card" role="dialog" aria-label="Comment ça marche">
        <button type="button" class="tuto-skip" aria-label="Passer">Passer</button>
        <div class="tuto-icon">${t.icon}</div>
        <div class="bp-name">${t.title}</div>
        <div class="tuto-body">${t.html}</div>
        <div class="tuto-dots">${TUTO.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <button type="button" class="btn btn-primary bp-btn tuto-next">${i < TUTO.length - 1 ? 'Suivant' : "C'est parti !"}</button>
      </div>`;
    $('.tuto-next', el).onclick = () => { if (i < TUTO.length - 1) { i++; paint(); } else close(); };
    $('.tuto-skip', el).onclick = close;
  };
  const close = () => { el.classList.remove('show'); el.classList.add('hide'); setTimeout(() => el.remove(), 260); };
  paint();
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
}

// Animation d'entrée : la carte part de loin (vue de la région) et plonge sur la position.
const FAR_VIEW = { center: [4.2, 46.2], zoom: 4.8 };
let introDone = false;
function introFly() {
  if (introDone) return;
  introDone = true;
  const go = () => {
    // La liste du bas n'apparaît qu'une fois la carte posée (plus d'animation, zoom rapproché).
    let still = 0;
    const started = Date.now();
    const watch = setInterval(() => {
      const landed = !map.isMoving() && map.getZoom() >= 8 && Date.now() - started > 800;
      still = landed ? still + 1 : 0;
      if (still >= 2 || Date.now() - started > 7000) { clearInterval(watch); showCards(); }
    }, 200);
    const p = myPosition();
    mark('fly');
    introZoom = true;
    markersOn = true; // les pastilles apparaîtront pendant la plongée
    if (p) {
      firstFix = false;
      map.flyTo({ center: [p.lng, p.lat], zoom: 13.5, duration: map.getZoom() > 8 ? 1300 : 1900, curve: 1.42, essential: true });
    } else if (state.establishments.size) {
      // Sans GPS : dernier endroit regardé, sinon la France entière + bulle « Ma ville ».
      const v = savedView();
      if (v) map.flyTo({ center: [v.lng, v.lat], zoom: v.zoom, duration: 1800, curve: 1.42, essential: true });
      else { map.fitBounds(FRANCE, { padding: { top: 80, bottom: 190, left: 20, right: 20 }, duration: 1600 }); setTimeout(zonePicker, 1800); setTimeout(showCards, 1800); }
    } else {
      showCards();
    }
  };
  // Localisation autorisée : on attend la position (jusqu'à 6 s) plutôt que le dernier endroit regardé.
  if (myPosition()) { go(); return; }
  const wait = (ms) => {
    const t0 = Date.now();
    const iv = setInterval(() => { if (myPosition() || Date.now() - t0 > ms) { clearInterval(iv); go(); } }, 150);
  };
  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' })
      .then((r) => wait(r.state === 'granted' ? 3500 : 900))
      .catch(() => wait(900));
  } else wait(900);
}

// ---------------------------------------------------------------------------
// Position de l'utilisateur
// ---------------------------------------------------------------------------
let firstFix = true;
function watchGps() {
  if (!navigator.geolocation) return;
  // Position récente gardée par le téléphone (< 10 min) : réponse quasi immédiate pour la plongée d'entrée.
  navigator.geolocation.getCurrentPosition((p) => {
    if (state.gps) return;
    state.gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    mark('gps');
    preloadAround(state.gps.lat, state.gps.lng); renderMe();
  }, () => {}, { enableHighAccuracy: false, maximumAge: 600000, timeout: 4000 });
  navigator.geolocation.watchPosition((p) => {
    const first = !state.gps;
    state.gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    if (first) preloadAround(state.gps.lat, state.gps.lng);
    renderMe();
    maybeNudge();
    if (firstFix && state.sheetView === 'detail' && state.selectedId) renderDetail(state.selectedId);
    if (firstFix && !testPosition() && introDone) {
      firstFix = false;
      map.flyTo({ center: [state.gps.lng, state.gps.lat], zoom: 13 });
    }
  }, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 });
}

// ---------------------------------------------------------------------------
// Rappel « Tu es chez … » : une seule fois par jour, quand on est à moins de 100 m d'un resto
// (la base reste juge de la distance au moment du signalement ; ici on propose seulement).
// ---------------------------------------------------------------------------
const NUDGE_M = 100;
const parisDay = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
let nudgeTick = 0;
function maybeNudge() {
  if (!introDone || state.sheetView || document.getElementById('nudge')) return;
  const p = myPosition();
  if (!p || (p.accuracy && p.accuracy > 80)) return;
  if (store.get('ydp_nudge_day') === parisDay()) return;
  if (mapMoving || Date.now() - nudgeTick < 10000) return; // au plus toutes les 10 s, jamais pendant un déplacement
  nudgeTick = Date.now();
  let best = null;
  const dLat = 0.002, dLng = 0.003; // tri rapide (~200 m) avant le calcul exact
  state.establishments.forEach((e) => {
    if (Math.abs(e.lat - p.lat) > dLat || Math.abs(e.lng - p.lng) > dLng) return;
    const d = distanceM(p.lat, p.lng, e.lat, e.lng);
    if (d > NUDGE_M || (best && d >= best.d)) return;
    if (openState(state.hours?.[e.id])?.open === false) return;
    best = { e, d };
  });
  if (!best) return;
  store.set('ydp_nudge_day', parisDay());
  const el = document.createElement('div');
  el.id = 'nudge'; el.className = 'nudge';
  el.innerHTML = `<div class="nudge-t"><b>📍 Tu es chez ${esc(best.e.name)}</b><span>Y'a du peuple ?</span></div>
    <button class="btn btn-primary" id="nudge-go">Signaler</button>
    <button class="nudge-x" id="nudge-x" aria-label="Fermer">✕</button>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  $('#nudge-x').onclick = close;
  $('#nudge-go').onclick = () => { close(); openReport(best.e.id); };
  setTimeout(close, 20000);
}
setInterval(maybeNudge, 15000);

// ---------------------------------------------------------------------------
// Alertes « c'est calme » sur les favoris (notifications push, 18/11/2026)
// La base décide qui prévient et quand (8 h-22 h, 1 par resto et par jour, 3 par jour max) ; l'appli abonne ou désabonne.
// ---------------------------------------------------------------------------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function pushSub() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
function pushCardHtml() {
  if (!state.user) return '';
  if (!pushSupported()) {
    return isIos() && !isStandalone()
      ? `<div class="set-card"><div class="set-block"><span class="set-big">🔔</span><div class="grow"><div class="t">Alertes sur tes favoris</div><div class="s">Pour les recevoir sur iPhone, installe d'abord l'appli sur ton écran d'accueil.</div></div></div></div>`
      : '';
  }
  return `<div class="set-card" id="push-card">
    <div class="set-block"><span class="set-big">🔔</span><div class="grow"><div class="t">Alertes sur tes favoris</div><div class="s" id="push-sub">Reçois une notif quand un de tes restos favoris est calme (pas plus de 3 par jour).</div></div></div>
    <button type="button" class="btn btn-primary" id="btn-push" disabled>…</button>
  </div>`;
}
async function bindPushCard(body) {
  const btn = $('#btn-push', body); if (!btn) return;
  const sub = $('#push-sub', body);
  const paint = async () => {
    const perm = Notification.permission;
    const s = perm === 'granted' ? await pushSub().catch(() => null) : null;
    if (perm === 'denied') { btn.hidden = true; sub.textContent = 'Les notifications sont bloquées pour cette appli : autorise-les dans les réglages du téléphone.'; return; }
    btn.hidden = false; btn.disabled = false;
    btn.textContent = s ? 'Désactiver les alertes' : 'Activer les alertes';
    btn.className = s ? 'btn btn-ghost' : 'btn btn-primary';
    btn.dataset.on = s ? '1' : '';
  };
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      if (btn.dataset.on) {
        const s = await pushSub();
        if (s) { await api.deletePushSubscription(s.endpoint).catch(() => {}); await s.unsubscribe().catch(() => {}); }
        toast('Alertes désactivées');
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { toast('Notifications refusées'); }
        else {
          const key = await api.pushPublicKey();
          if (!key) throw new Error('Alertes pas encore disponibles, réessaie plus tard.');
          const reg = await navigator.serviceWorker.ready;
          const s = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
          const r = await api.savePushSubscription(s.toJSON());
          if (r && r.ok === false) throw new Error('Impossible d\'activer les alertes.');
          toast('Alertes activées 🔔');
        }
      }
    } catch (err) { toast(err.message || 'Impossible d\'activer les alertes.'); }
    paint();
  };
  paint();
}
if (!DEMO && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
// Demande la localisation : fenêtre du navigateur si possible, sinon explications pour la réactiver.
function gpsHelp(kind) {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const pwa = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  const off = kind === 'off';
  const steps = off
    ? (ios
      ? ['Ouvre <b>Réglages</b> du téléphone › <b>Confidentialité et sécurité</b> › <b>Service de localisation</b>.', 'Active-le, puis descends sur <b>Safari</b> (ou l\'appli) › <b>Lorsque l\'app est active</b>.']
      : ['Fais glisser le haut de l\'écran vers le bas.', 'Active <b>Localisation</b> (ou <b>Position</b>).'])
    : ios
      ? (pwa
        ? ['Ouvre <b>Réglages</b> du téléphone › <b>Confidentialité et sécurité</b> › <b>Service de localisation</b>.', 'Choisis <b>Safari</b> (ou « Sites web Safari ») › <b>Lorsque l\'app est active</b>.', 'Reviens ici et touche à nouveau 📍.']
        : ['Dans Safari, touche <b>aA</b> (ou l\'icône à gauche de l\'adresse) › <b>Réglages du site web</b>.', '<b>Position</b> › <b>Autoriser</b> (ou « Demander »).', 'Si ça ne marche pas : Réglages du téléphone › Confidentialité › Service de localisation › Safari › <b>Lorsque l\'app est active</b>.'])
      : (pwa
        ? ['Appui long sur l\'icône <b>Y\'a du peuple ?</b> › <b>Infos sur l\'appli</b>.', '<b>Autorisations</b> › <b>Position</b> › <b>Autoriser</b>.', 'Reviens ici et touche à nouveau 📍.']
        : ['Touche l\'icône à gauche de l\'adresse (🔒 ou ⚙️) en haut.', '<b>Autorisations</b> (ou Paramètres du site) › <b>Position</b> › <b>Autoriser</b>.', 'Recharge la page.']);
  openSheet('gpshelp', `
    <div class="sheet-head">
      <div class="grow"><h2>${off ? 'Active la localisation' : 'Autorise la localisation'}</h2>
        <div class="sub">${off ? 'La localisation du téléphone est coupée.' : 'Elle a été refusée : le navigateur ne peut plus la redemander tout seul.'}</div></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <ol class="gps-steps">${steps.map((t) => `<li>${t}</li>`).join('')}</ol>
    <div class="hint">Ta position sert à trouver les restos proches et à signaler. Elle n'est jamais affichée aux autres.</div>
    <button class="btn btn-primary" id="btn-gps-retry" style="width:100%">Réessayer</button>`);
  $('#btn-close').onclick = closeSheet;
  $('#btn-gps-retry').onclick = () => { closeSheet(); askLocation(); };
}
function askLocation() {
  if (!navigator.geolocation) { toast('Ce navigateur ne donne pas la position.'); return; }
  // Appel direct au toucher : c'est ce qui fait apparaître la fenêtre « Autoriser » du navigateur.
  navigator.geolocation.getCurrentPosition((p) => {
    state.gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    renderMe();
    map.flyTo({ center: [state.gps.lng, state.gps.lat], zoom: 14 });
    if (state.sheetView === 'detail' && state.selectedId) renderDetail(state.selectedId);
    watchGps();
  }, (err) => {
    if (err.code === 1) gpsHelp('denied');
    else if (err.code === 2) gpsHelp('off');
    else toast('Position introuvable pour l\'instant, réessaie dehors ou dans un instant.');
  }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
}
window.askLocation = askLocation;
$('#toast').addEventListener('click', () => {
  if ($('#toast').dataset.action === 'gps') { $('#toast').hidden = true; askLocation(); }
});
$('#btn-locate').addEventListener('click', () => {
  const p = myPosition();
  if (p) map.flyTo({ center: [p.lng, p.lat], zoom: 14 });
  else askLocation();
});

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
// Bandeau « pas de connexion » avec un bouton pour réessayer.
function showOffline(msg) {
  const el = $('#offline');
  el.innerHTML = `<span>📡 ${esc(msg)}</span><button type="button">Réessayer</button>`;
  el.hidden = false;
  el.querySelector('button').onclick = () => location.reload();
}
window.addEventListener('offline', () => showOffline('Pas de connexion internet.'));
window.addEventListener('online', () => {
  if (!state.establishments.size) location.reload();
  else { $('#offline').hidden = true; refreshStatuses(); }
});

async function start() {
  if (DEMO) $('#demo-banner').hidden = false;
  api.onAuthChange(onUserChanged);
  const user = await api.getUser().catch(() => null);
  mark('user');
  onUserChanged(user).catch(() => {}); // profil et favoris se chargent en parallèle : on n'attend plus avant de lancer la carte
  document.body.classList.add('intro'); // liste du bas cachée jusqu'à la fin de l'animation
  // Départ de la plongée : au-dessus du dernier endroit regardé (tuiles déjà chargées pendant le démarrage),
  // sinon vue lointaine sur la France (première ouverture).
  { const sv = savedView(); map.jumpTo(sv ? { center: [sv.lng, sv.lat], zoom: 10 } : FAR_VIEW); }
  if (!user) { perf.welcome = true; showWelcome(); } // écran d'accueil à chaque ouverture tant qu'on n'est pas connecté
  document.documentElement.classList.remove('booting'); // la carte ou l'accueil peut maintenant s'afficher

  try {
    if (cachedEstablishments()) {
      perf.cached = true; mark('est');
      renderMarkers();
      loadEstablishments().catch(() => {}); // mise à jour en arrière-plan
    } else {
      await loadEstablishments();
      mark('est');
    }
  } catch (err) {
    showOffline(navigator.onLine === false ? 'Pas de connexion internet.' : (err.message || 'Impossible de charger les restaurants.'));
    return;
  }
  $('#offline').hidden = true;
  renderMe();
  watchGps();
  { const p = myPosition() || savedView(); if (p) preloadAround(p.lat, p.lng); }
  const deep = new URLSearchParams(location.search).get('r');
  if (deep && state.establishments.has(deep)) {
    // Lien partagé vers un resto : on ouvre directement sa fiche.
    introDone = true;
    $('#welcome').hidden = true;
    markersOn = true;
    map.jumpTo({ center: [state.establishments.get(deep).lng, state.establishments.get(deep).lat], zoom: 15 });
    showCards();
    openDetail(deep);
  } else if ($('#welcome').hidden) {
    introFly();
  }
  await refreshStatuses();
  mark('statuts');
  setInterval(() => { if (!document.hidden) refreshStatuses(true); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStatuses(); });
}

start();

// Pour les tests automatiques uniquement.
window.__ydp = { state, map, openDetail, openReport, openAccount, openSearch, openShare, renderAccount, renderAuth };

// Bouton « ma position » toujours juste au-dessus des cartes du bas
(() => {
  const box = $('#cards');
  const place = () => {
    const h = box.offsetHeight || 140;
    document.documentElement.style.setProperty('--cards-h', h + 'px');
  };
  if (window.ResizeObserver) new ResizeObserver(place).observe(box);
  window.addEventListener('resize', place);
  place();
})();

// Fiche : glisser vers le bas depuis la barre grise (ou le titre) pour fermer
(() => {
  const sheet = $('#sheet');
  let y0 = null, dy = 0, t0 = 0;
  const startOk = (ev) => !sheet.classList.contains('full') &&
    (ev.target.closest('.sheet-grip') || (ev.target.closest('.sheet-head') && !ev.target.closest('button, a, input')));
  sheet.addEventListener('touchstart', (ev) => {
    if (!startOk(ev)) return;
    y0 = ev.touches[0].clientY; dy = 0; t0 = Date.now();
    sheet.style.transition = 'none';
  }, { passive: true });
  window.addEventListener('touchmove', (ev) => {
    if (y0 === null) return;
    dy = Math.max(0, ev.touches[0].clientY - y0);
    sheet.style.setProperty('--drag', dy + 'px');
    if (dy > 4) ev.preventDefault();
  }, { passive: false });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.5;
    sheet.style.transition = 'transform .2s ease';
    if (dy > 110 || fast) {
      sheet.style.setProperty('--drag', sheet.offsetHeight + 'px');
      setTimeout(() => { closeSheet(); sheet.style.transition = ''; sheet.style.setProperty('--drag', '0px'); }, 200);
    } else {
      sheet.style.setProperty('--drag', '0px');
      setTimeout(() => { sheet.style.transition = ''; }, 200);
    }
  };
  // Sur la fenêtre : la fiche peut être redessinée pendant le glissé (le doigt « perd » alors son élément)
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', end);
})();

// iPhone (Safari ignore user-scalable=no) : bloque le pincement hors de la carte
['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (ev) => {
  if (!ev.target.closest?.('#map')) ev.preventDefault();
}, { passive: false }));

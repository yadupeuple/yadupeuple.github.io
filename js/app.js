// Y'a du peuple ? — logique de l'appli (carte, fiche, signalement, compte).
import { api, DEMO } from './api.js?v=107';
import {
  MAP_STYLE_URL, DEFAULT_CENTER, DEFAULT_ZOOM, CONTACT_EMAIL, GOOGLE_CLIENT_ID,
  ROUTE, REFRESH_MS,
} from './config.js?v=107';
import {
  LEVELS, LEVEL_INFO, WAIT_INFO, NO_INFO, levelInfo, describeStatus, mainStatus, brandShort,
  theoryLevelAt, parisNow, bestTimeToday, fmtHour, distanceM, fmtDistance, ago,
  levelFromPercent, gDay, dayHours, bestTimeFromProfile, openState, hoursLines,
  estimateRoute, fmtDuration,
} from './levels.js?v=107';
import { airbnbize, addShieldImage } from './mapstyle.js?v=107';
import { BRAND_PATHS } from './brands.js?v=107';

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
  dragRotate: false,
  pitchWithRotate: false,
});
map.touchZoomRotate.disableRotation();
// Mentions de la carte (obligatoires) : petit bouton « i » discret en haut à gauche, sous le titre,
// replié par défaut ; un toucher affiche les crédits.
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-left');
const foldAttrib = () => document.querySelectorAll('.maplibregl-ctrl-attrib').forEach((el) => el.classList.remove('maplibregl-compact-show'));
map.on('load', foldAttrib);
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
const BRANDS = ["McDonald's", 'Burger King', 'KFC', 'Quick', 'Subway', 'Buffalo Grill', "O'Tacos", 'Starbucks', 'Flunch'];
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
// Zones couvertes : sert à poser la carte au bon endroit quand le GPS n'est pas disponible.
const ZONES = [
  { key: 'moselle', label: 'Moselle', test: (e) => e.lat >= 48 },
  { key: 'mulhouse', label: 'Mulhouse', test: (e) => e.lat < 48 },
];
function savedZone() { try { return localStorage.getItem('ydp_zone'); } catch { return null; } }
function saveZone(k) { try { localStorage.setItem('ydp_zone', k); } catch {} }
function zoneBounds(key) {
  const z = ZONES.find((x) => x.key === key) || ZONES[0];
  const b = new maplibregl.LngLatBounds();
  let n = 0;
  state.establishments.forEach((e) => { if (z.test(e)) { b.extend([e.lng, e.lat]); n++; } });
  return n ? b : null;
}
function goZone(key, duration = 1600) {
  const b = zoneBounds(key);
  if (!b) return;
  saveZone(key);
  map.fitBounds(b, { padding: { top: 80, bottom: 170, left: 30, right: 30 }, duration, maxZoom: 13 });
}
// Mémorise la zone regardée (la plus proche du centre de la carte) pour la prochaine ouverture.
function rememberZone() {
  if (map.getZoom() < 9 || !state.establishments.size) return;
  const c = map.getCenter();
  let best = null, bestD = Infinity;
  state.establishments.forEach((e) => {
    const d = distanceM(c.lat, c.lng, e.lat, e.lng);
    if (d < bestD) { bestD = d; best = e; }
  });
  const z = best && ZONES.find((x) => x.test(best));
  if (z && bestD < 60000) saveZone(z.key);
}
function zonePicker() {
  const el = $('#zone-pick');
  el.innerHTML = `<span>Ta zone :</span>${ZONES.map((z) => `<button type="button" data-zone="${z.key}">${esc(z.label)}</button>`).join('')}<button type="button" class="zp-x" aria-label="Fermer">✕</button>`;
  el.hidden = false;
  el.querySelectorAll('[data-zone]').forEach((b) => b.onclick = () => { goZone(b.dataset.zone); el.hidden = true; });
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
      <div class="section-title">Aller à</div>
      <div class="fchips">${ZONES.map((z) => `<button type="button" class="fchip" data-zone="${z.key}">📍 ${esc(z.label)}</button>`).join('')}</div>
      <div class="section-title">Service</div>
      <div class="fchips"><button type="button" class="fchip ${filters.drive ? 'on' : ''}" data-drive="1">🚗 Avec Drive</button></div>
      <div class="filter-actions ${filtersActive() ? '' : 'single'}">
        ${filtersActive() ? '<button type="button" class="btn btn-ghost" id="btn-freset">Effacer</button>' : ''}
        <button type="button" class="btn btn-primary" id="btn-fok">Voir ${count()} resto${count() > 1 ? 's' : ''}</button>
      </div>`);
    const keep = $('#sheet-body').scrollTop;
    $('#btn-close').onclick = closeSheet;
    $('#btn-fok').onclick = closeSheet;
    if ($('#btn-freset')) $('#btn-freset').onclick = () => { filters.brands.clear(); filters.levels.clear(); filters.drive = false; apply(); };
    document.querySelectorAll('#sheet-body .fchip').forEach((b) => b.onclick = () => {
      if (b.dataset.zone) { closeSheet(); goZone(b.dataset.zone); return; }
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

function renderMarkers() {
  for (const e of state.establishments.values()) {
    let m = state.markers.get(e.id);
    if (!m) {
      const el = document.createElement('button');
      el.className = 'pill';
      el.type = 'button';
      el.setAttribute('aria-label', e.name);
      el.addEventListener('click', (ev) => { ev.stopPropagation(); openDetail(e.id); });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([e.lng, e.lat]).addTo(map);
      m = { marker, el };
      state.markers.set(e.id, m);
    }
    m.el.innerHTML = pillHtml(e);
    const os = openState(state.hours?.[e.id]);
    m.el.classList.toggle('closed', !!(os && !os.open));
    m.el.classList.toggle('selected', state.selectedId === e.id);
    m.hidden = !passesFilter(e);
  }
  applyZoomClass();
  updateClusters();
}

// ---------------------------------------------------------------------------
// Regroupement des pastilles trop proches (« 3 restos »)
// ---------------------------------------------------------------------------
const CLUSTER_PX = 46;
const clusterMarkers = [];
let focusId = null; // resto mis en avant par la liste du bas
function updateClusters() {
  for (const c of clusterMarkers) c.remove();
  clusterMarkers.length = 0;
  const pts = [];
  for (const e of state.establishments.values()) {
    const m = state.markers.get(e.id);
    if (!m) continue;
    if (m.hidden) { m.el.style.display = 'none'; continue; }
    const p = map.project([e.lng, e.lat]);
    pts.push({ e, m, x: p.x, y: p.y, used: false });
  }
  for (const a of pts) {
    if (a.used) continue;
    const group = [a];
    for (const b of pts) {
      if (b === a || b.used) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < CLUSTER_PX) group.push(b);
    }
    if (group.length === 1) { a.used = true; a.m.el.style.display = ''; continue; }
    for (const g of group) { g.used = true; g.m.el.style.display = 'none'; }
    const members = group.map((g) => g.e);
    const lng = members.reduce((t, e) => t + e.lng, 0) / members.length;
    const lat = members.reduce((t, e) => t + e.lat, 0) / members.length;
    // couleur = resto le plus chargé du groupe
    let worst = describeStatus(mainStatus(members[0])).info;
    for (const e of members) { const i = describeStatus(mainStatus(e)).info; if (i.rank > worst.rank) worst = i; }
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pill cluster' + (members.some((m) => m.id === focusId) ? ' focus' : '');
    el.dataset.ids = members.map((m) => m.id).join(',');
    el.setAttribute('aria-label', `${members.length} restaurants`);
    el.innerHTML = `<span class="dot" style="background:${worst.color}"></span>${members.length}`;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); openCluster(members); });
    clusterMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map));
  }
}
map.on('moveend', () => { updateClusters(); rememberZone(); });

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

function applyZoomClass() {
  const compact = map.getZoom() < 11.5;
  for (const { el } of state.markers.values()) {
    el.style.padding = compact ? '4px' : '';
    el.style.fontSize = compact ? '0px' : '';
    el.style.gap = compact ? '0' : '';
  }
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
async function loadEstablishments() {
  const [rows, hours] = await Promise.all([
    api.listEstablishments(),
    api.openingHours ? api.openingHours().catch(() => ({})) : {},
  ]);
  state.hours = hours || {};
  for (const r of rows) state.establishments.set(r.id, { ...state.establishments.get(r.id), ...r });
  renderMarkers();
  renderCards();
}

// Les statuts arrivent par la fonction « restos proches » (rayon max 5 km).
// On choisit quelques points de la zone pour couvrir tous les restos.
function coverPoints() {
  const left = [...state.establishments.values()];
  const points = [];
  while (left.length) {
    const c = left[0];
    points.push(c);
    for (let i = left.length - 1; i >= 0; i--) {
      if (distanceM(c.lat, c.lng, left[i].lat, left[i].lng) <= 4800) left.splice(i, 1);
    }
  }
  return points;
}

let refreshing = false;
async function refreshStatuses() {
  if (refreshing || !state.establishments.size) return;
  refreshing = true;
  try {
    const [results] = await Promise.all([Promise.allSettled(coverPoints().map((p) => api.nearby(p.lat, p.lng, 5000, 50))), loadPartners()]);
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      for (const row of r.value) {
        const e = state.establishments.get(row.id);
        if (e) { e.status_salle = row.status_salle; e.status_drive = row.status_drive; }
      }
    }
    renderMarkers();
    renderCards();
    if (state.sheetView === 'detail' && state.selectedId) renderDetail(state.selectedId);
  } finally {
    refreshing = false;
  }
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
  if (cardsMove) { cardsMove = false; return; }
  clearTimeout(cardsTimer); cardsTimer = setTimeout(renderCards, 150);
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
    const hidden = state.markers.get(e.id)?.el.style.display === 'none';
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
  $('#cards').style.visibility = 'hidden';
}
function closeSheet() {
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
function updateScrollHints() {
  const b = $('#sheet-body');
  const more = b.scrollHeight - b.clientHeight - b.scrollTop > 40;
  $('#hint-down').hidden = $('#sheet').hidden || !more;
  $('#hint-up').hidden = $('#sheet').hidden || b.scrollTop < 80;
}
$('#sheet-body').addEventListener('scroll', updateScrollHints, { passive: true });
new MutationObserver(() => requestAnimationFrame(updateScrollHints)).observe($('#sheet-body'), { childList: true, subtree: true });
window.addEventListener('resize', updateScrollHints);
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
// Partage (WhatsApp, Snapchat, Facebook, Instagram via le menu du téléphone…)
// ---------------------------------------------------------------------------
const APP_URL = 'https://yadupeuple.github.io/';
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
    ? `<div class="service-wait">🚗 File au Drive : ${WAIT_INFO[st.wait].label}</div>` : '';
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

function curveHtml(e, profile) {
  const { h, dow } = parisNow();
  if (!profile) {
    // Pas de courbe Google pour ce resto : courbe type des fast-foods
    const hours = [];
    for (let t = 11; t <= 22; t++) hours.push(t);
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
  const hours = dayHours(profile, day);
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
      dist.textContent = `📍 ${fmtDistance(r.m)}`;
      time.textContent = `🚗 ${fmtDuration(r.min)} de trajet`;
    }
    const sub = document.querySelector(`#cards .card[data-id="${e.id}"] .card-dist`);
    if (sub) sub.textContent = fmtDistance(r.m);
  } catch { routeCache.set(key, { failed: Date.now() }); }
}

function routeHtml(e) {
  const p = myPosition();
  if (!p) {
    return `<div class="route"><button type="button" class="chip chip-btn" id="btn-route-gps">📍 Voir le temps de trajet</button></div>`;
  }
  const d = distanceM(p.lat, p.lng, e.lat, e.lng);
  const real = d > 150 ? cachedRoute(e, p) : null;
  const r = real || estimateRoute(d, ROUTE);
  const approx = real ? '' : '≈ ';
  const parts = [`<span class="chip" id="route-dist">📍 ${d > 150 ? approx + fmtDistance(r.m) : fmtDistance(d)}</span>`];
  if (d > 150) {
    parts.push(`<span class="chip" id="route-time">🚗 ${approx}${fmtDuration(r.min)} de trajet</span>`);
    if (!real) setTimeout(() => refineRoute(e, p), 0);
  }
  if (e.has_drive) {
    const w = e.status_drive?.wait && WAIT_INFO[e.status_drive.wait];
    parts.push(w
      ? `<span class="chip">+ file au Drive : ${w.short} voitures</span>`
      : `<span class="chip chip-muted">File au Drive : pas d'info récente</span>`);
  }
  return `<div class="route">${parts.join('')}</div>`;
}

// Resto dont la fiche est affichée : quand on la redessine (jour du graphique, rafraîchissement…), on garde la position de défilement.
let detailShown = null;
function renderDetail(id) {
  const e = state.establishments.get(id);
  if (!e) return;
  const keepScroll = state.sheetView === 'detail' && detailShown === id && !$('#sheet').hidden ? $('#sheet-body').scrollTop : null;
  const profile = detailExtra.get(id)?.profile || null;
  const calmer = detailExtra.get(id)?.calmer;
  const fav = state.favorites.has(id);
  const html = `
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
    ${calmer ? `<div class="hint">💡 ${esc(calmer)}</div>` : ''}
    ${curveHtml(e, profile)}
    <button class="btn btn-primary" id="btn-report">J'y suis : je signale l'affluence</button>
  `;
  openSheet('detail', html);
  if (keepScroll !== null) { $('#sheet-body').scrollTop = keepScroll; requestAnimationFrame(updateScrollHints); }
  detailShown = id;
  $('#btn-close').onclick = closeSheet;
  $('#btn-report').onclick = () => openReport(id);
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

async function openDetail(id) {
  const e = state.establishments.get(id);
  if (!e) return;
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
      e.has_dine_in ? api.calmerNearby(id).catch(() => '') : '',
      api.popularTimes ? api.popularTimes(id).catch(() => null) : null,
    ]);
    if (e.has_dine_in) e.status_salle = salle;
    if (e.has_drive) e.status_drive = drive;
    detailExtra.set(id, { history: { salle: hs || [], drive: hd || [] }, calmer, profile });
    renderMarkers();
    if (state.sheetView === 'detail' && state.selectedId === id) renderDetail(id);
  } catch (err) {
    toast(err.message || 'Impossible de charger la fiche.');
  }
}

async function toggleFav(id) {
  if (!state.user) { openAccount('Connecte-toi pour garder tes restos favoris.'); return; }
  try {
    const msg = await api.toggleFavorite(id);
    if (msg === 'Ajoute aux favoris') state.favorites.add(id);
    else if (msg === 'Retire des favoris') state.favorites.delete(id);
    toast(msg === 'Ajoute aux favoris' ? 'Ajouté aux favoris ⭐' : msg === 'Retire des favoris' ? 'Retiré des favoris' : msg);
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
          ${services.map((s) => `<button data-service="${s}" class="${form.service === s ? 'on' : ''}">${s === 'salle' ? '🍔 En salle' : '🚗 Au Drive'}</button>`).join('')}
        </div>` : ''}
      <div class="label">${form.service === 'drive' ? 'Comment ça bouge au Drive ?' : 'Combien de monde en salle ?'}</div>
      <div class="levels">
        ${LEVELS.map((l) => `<button class="level-btn ${form.level === l ? 'on' : ''}" data-level="${l}" style="background:${LEVEL_INFO[l].soft}"><span class="dot" style="background:${LEVEL_INFO[l].color}"></span>${esc(LEVEL_INFO[l].label)}</button>`).join('')}
      </div>
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

const BADGE_NAMES = {
  v1: 'Premier signalement', v10: '5 signalements', v50: '10 signalements', v100: '25 signalements',
  v250: '50 signalements', v500: '100 signalements', drive10: 'Éclaireur du Drive',
  explorer: 'Explorateur', tour_zone: 'Tour de la zone',
};

function showReportResult(id, res) {
  const badges = (res.new_badges || []).map((b) => `<span class="badge-new">🏅 ${esc(BADGE_NAMES[b] || b)}</span>`).join('');
  const html = `
    <div class="result">
      <div style="font-size:42px">🙌</div>
      <h2 style="margin:6px 0">Merci, c'est envoyé !</h2>
      <div class="big">${res.points > 0 ? `+${res.points} points` : 'Pris en compte'}</div>
      <p>${res.points > 0 ? 'Ton info aide les prochains clients à éviter la foule.' : "Plus de points pour ce resto dans l'heure, mais ton info compte quand même."}</p>
      ${badges ? `<div style="margin:10px 0">Nouveau badge : ${badges}</div>` : ''}
    </div>
    <button class="btn btn-dark" id="btn-done">Voir la fiche</button>
  `;
  openSheet('result', html);
  $('#btn-done').onclick = () => openDetail(id);
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
      try {
        const rows = await api.search(q, p?.lat ?? null, p?.lng ?? null);
        if (!rows?.length) { ul.innerHTML = '<li class="muted">Aucun restaurant trouvé.</li>'; return; }
        ul.innerHTML = rows.map((r) => {
          const st = describeStatus(mainStatus(r));
          return `<li data-id="${r.id}" style="cursor:pointer">
            <span class="badge-ico" style="background:${st.info.soft}"><span class="dot" style="width:12px;height:12px;border-radius:50%;background:${st.info.color}"></span></span>
            <div class="grow"><div class="t">${esc(r.name)}</div><div class="s">${esc(r.city)}${r.distance_m != null ? ' · ' + fmtDistance(r.distance_m) : ''} · ${esc(st.info.label)}</div></div>
          </li>`;
        }).join('');
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
}

async function loadFavorites() {
  state.favorites.clear();
  if (!state.user) return;
  try { (await api.myFavorites() || []).forEach((e) => state.favorites.add(e.id)); } catch {}
}

async function renderAccount(tab = 'profil') {
  await custom.load();
  await refreshProfile();
  const p = state.profile || { pseudo: '…', points: 0, level_name: '', next_level_at: null };
  const pct = p.next_level_at ? Math.min(100, Math.round((p.points / p.next_level_at) * 100)) : 100;
  openSheet('account', `
    <div class="sheet-head">
      <div class="grow"><h2>${tab === 'reglages' ? 'Réglages' : 'Mon compte'}</h2></div>
      <button class="round-btn ${tab === 'reglages' ? 'on' : ''}" id="btn-settings" aria-label="Réglages">⚙️</button>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <div class="tabs" role="tablist">
      ${[['profil', 'Mon profil'], ['badges', 'Badges'], ['classement', 'Classement'], ['favoris', 'Favoris']]
        .map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    ${tab === 'profil' ? `
    <div class="profile-card">
      <div class="profile-banner" style="${custom.banner(p.banner)}"></div>
      <div class="profile-top">
        <button class="avatar" id="btn-custom" aria-label="Personnaliser mon profil">${custom.avatar(p.avatar) || esc((p.pseudo || '?').slice(0, 1).toUpperCase())}<span class="avatar-edit">✏️</span></button>
        <div class="grow">
          <div class="pseudo">${esc(p.pseudo)}</div>
          <div class="lvl">Niveau ${p.level ?? 1} · ${esc(p.level_name)}</div>
          ${p.member_since ? `<div class="since">Membre depuis ${memberSince(p.member_since)}</div>` : ''}
        </div>
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
      <div class="grow">
        <div class="t">🤝 Parrainage</div>
        <div class="s">${p.referrals ?? 0} ami${(p.referrals ?? 0) > 1 ? 's' : ''} parrainé${(p.referrals ?? 0) > 1 ? 's' : ''}${p.referrals_pending ? ` · ${p.referrals_pending} en attente de leur 1er signalement` : ''}<br>+20 pts pour toi, +10 pour ton ami à son 1er signalement.${p.parrain ? `<br>Ton parrain : <strong>${esc(p.parrain)}</strong>` : ''}</div>
        ${p.can_set_referrer && !p.parrain ? `<form id="ref-form" class="ref-form"><input name="code" placeholder="Code d'un parrain" maxlength="12" autocomplete="off"><button class="btn btn-dark">OK</button></form>` : ''}
      </div>
      <button class="btn btn-primary ref-btn" id="btn-refer">Inviter des amis</button>
    </div>
    <button class="btn btn-ghost" id="btn-custom2">🎨 Personnaliser mon image et ma bannière</button>` : ''}
    <div id="tab-body">${tab === 'profil' ? '' : '<div class="spinner"></div>'}</div>
  `);
  $('#btn-close').onclick = closeSheet;
  $('#btn-settings').onclick = () => renderAccount(tab === 'reglages' ? 'profil' : 'reglages');
  const on = (sel, fn) => { const el = document.querySelector(sel); if (el) el.onclick = fn; };
  on('#btn-custom', () => openCustomize());
  on('#btn-custom2', () => openCustomize());
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
    if (tab === 'badges') body.innerHTML = await badgesHtml();
    if (tab === 'classement') { await renderLeaderboard(body); return; }
    if (tab === 'favoris') { body.innerHTML = await favoritesHtml(); bindFavList(body); }
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
  img(v, cls = '') { return /\.(webp|png|svg)$/.test(v || '') ? `<img src="${v}?v=107" alt="" class="${cls}">` : (v || ''); },
  bg(v) { return /\.(webp|png|svg)$/.test(v || '') ? `url(${v}?v=107) center/cover` : v; },
  avatar(code) { return this.img(this.find('avatar', code)?.value, 'avatar-img'); },
  // Bannière affichée en bandeau entier (non rognée, donc nette) en haut de la carte de profil.
  banner(code) { const b = this.find('banner', code); return b ? `background:${this.bg(b.value)}` : ''; },
};
async function openCustomize() {
  await custom.load();
  const p = state.profile || {};
  const lvl = p.level || 1;
  const cell = (c) => {
    const locked = lvl < c.min_level;
    const on = (c.kind === 'avatar' ? p.avatar : p.banner) === c.code;
    const inner = c.kind === 'avatar' ? `<span class="cz-emoji">${custom.img(c.value, 'cz-img')}</span>` : `<span class="cz-banner" style="background:${custom.bg(c.value)}"></span>`;
    return `<button type="button" class="cz ${on ? 'on' : ''} ${locked ? 'locked' : ''}" data-kind="${c.kind}" data-code="${c.code}" ${locked ? 'disabled' : ''}>
      ${inner}<span class="cz-lock">${locked ? '🔒 ' : ''}Niv. ${c.min_level}</span></button>`;
  };
  openSheet('custom', `
    <div class="sheet-head">
      <button class="round-btn" id="btn-back" aria-label="Retour">${ICON.back}</button>
      <div class="grow"><h2>Personnaliser mon profil</h2><div class="sub">Niveau ${lvl} · de nouvelles images se débloquent aux niveaux 5, 10, 15… jusqu'à 100.</div></div>
    </div>
    <div class="section-title">Image de profil</div>
    <div class="cz-grid avatars">${custom.list.filter((c) => c.kind === 'avatar').map(cell).join('')}</div>
    <div class="section-title">Bannière</div>
    <div class="cz-grid banners">${custom.list.filter((c) => c.kind === 'banner').map(cell).join('')}</div>`);
  $('#btn-back').onclick = () => renderAccount('profil');
  $('#sheet-body').querySelectorAll('.cz:not(.locked)').forEach((b) => b.onclick = async () => {
    const r = await api.setCustomization(b.dataset.kind, b.dataset.code).catch((e) => ({ ok: false, message: e.message }));
    if (!r?.ok) { toast(r?.message || 'Impossible pour le moment.'); return; }
    await refreshProfile();
    openCustomize();
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
      <div class="profile-banner" style="${custom.banner(p.banner)}"></div>
      <div class="profile-top">
        <span class="avatar">${custom.avatar(p.avatar)}</span>
        <div class="grow">
          <div class="pseudo">${esc(p.pseudo)}</div>
          <div class="lvl">Niveau ${p.level} · ${esc(p.level_name)}</div>
          <div class="since">Membre depuis ${memberSince(p.member_since)}</div>
        </div>
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
  ['Volume', 'Signalements'], ['Variété', 'Exploration'], ['Parrainage', 'Parrainage'],
  ['Moments', 'Moments'], ['Fiabilité', 'Fiabilité'],
];
const BADGE_ICONS = {
  v1: '📍', v10: '🖐️', v50: '🔟', v100: '🥉', v250: '🥈', v500: '🥇',
  drive10: '🚗', explorer: '🧭', explorer10: '🍽️', tour_zone: '🗺️', tour_zone6: '🏙️',
  ref1: '🤝', ref10: '📣', ref30: '👑',
  coup_de_feu: '🔥', regulier: '📅', fiable: '✅', oeil_lynx: '🦉',
};
// Illustrations des badges (icons/badges/*.webp, images ChatGPT d'Alexis) ; emoji en secours pour un badge sans image.
const BADGE_ART = new Set(['v1', 'v10', 'v50', 'v100', 'v250', 'v500', 'drive10', 'explorer', 'explorer10', 'tour_zone', 'tour_zone6', 'ref1', 'ref10', 'ref30', 'coup_de_feu', 'regulier', 'fiable', 'oeil_lynx']);
// Badges en .svg : plus aucun (outils/badges_sheet.py et badges_sheet2.py découpent les images ChatGPT).
const BADGE_SVG = new Set(); // tous les badges sont maintenant des images ChatGPT (.webp)
const badgeImg = (code) => BADGE_ART.has(code)
  ? `<img src="icons/badges/${code}.${BADGE_SVG.has(code) ? 'svg' : 'webp'}?v=107" alt="" class="badge-img">`
  : `<span class="badge-emoji">${BADGE_ICONS[code] || '🏅'}</span>`;
async function badgesHtml() {
  const rows = await api.badgesProgress() || [];
  if (!rows.length) return '<p class="muted">Aucun badge pour le moment.</p>';
  const item = (b) => {
    const prog = b.is_active && b.target_value ? Math.round((b.current_value / b.target_value) * 100) : 0;
    const sub = !b.is_active ? 'Bientôt disponible' : b.earned ? 'Obtenu ✅' : `${b.current_value} / ${b.target_value}`;
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
  let html = '<p class="badge-rule">🏅 +1 point par badge · 🎉 +10 points par catégorie complète</p>';
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
    <div id="lb-prize"></div>
    <div id="lb-list"><div class="spinner"></div></div>`;
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
  const rows = await api.ranking(scope, city) || [];
  $('#lb-list').innerHTML = rows.length ? `<ul class="list">${rows.map((r) => `
    <li class="${r.is_me ? 'me-row' : ''} lb-row" data-pseudo="${esc(r.pseudo)}" role="button" tabindex="0">
    <span class="rank">${r.rang <= 3 ? ['🥇', '🥈', '🥉'][r.rang - 1] : r.rang}</span>
    <span class="lb-av">${custom.avatar(r.avatar)}</span>
    <div class="grow"><div class="t">${esc(r.pseudo)}${r.is_me ? ' (moi)' : ''}</div></div><strong>${r.points} pts</strong></li>`).join('')}</ul>`
    : '<p class="muted">Personne n\'a encore gagné de points sur cette période. À toi de jouer !</p>';
  $('#lb-list').querySelectorAll('.lb-row').forEach((li) => li.onclick = () => openPublicProfile(li.dataset.pseudo, () => renderAccount('classement')));
}

async function favoritesHtml() {
  const rows = await api.myFavorites() || [];
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
  const t = testPosition();
  return `
    <div class="section-title">Pseudo</div>
    <form id="pseudo-form" style="display:flex;gap:8px">
      <input class="select" style="flex:1;font-size:16px" name="pseudo" value="${esc(state.profile?.pseudo || '')}" minlength="3" maxlength="20">
      <button class="btn btn-dark" style="width:auto;padding:10px 16px">OK</button>
    </form>

    ${state.profile?.ref_code ? `<div class="section-title">Mon code de parrainage</div>
    <div class="my-code">
      <div class="mc-code" aria-label="Mon code">${esc(state.profile.ref_code)}</div>
      <button type="button" class="btn btn-ghost mc-btn" id="btn-copy-code">Copier</button>
      <button type="button" class="btn btn-primary mc-btn" id="btn-share-code">Partager</button>
    </div>
    <p class="muted mc-note">Ton ami saisit ce code dans son profil (ou ouvre ton lien) : +20 pts pour toi, +10 pour lui à son 1er signalement.</p>` : ''}

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

    ${isTester() ? `<div class="section-title">Mode test</div>
    <p class="muted">Position fictive « latitude, longitude » pour tester sans être sur place. Vide = vrai GPS.</p>
    <form id="test-form" style="display:flex;gap:8px">
      <input class="select" style="flex:1;font-size:16px" name="pos" placeholder="49.3581, 6.1378" value="${t ? `${t.lat}, ${t.lng}` : ''}">
      <button class="btn btn-dark" style="width:auto;padding:10px 16px">OK</button>
    </form>
    <p><a class="link-btn" href="affiche.html" target="_blank" rel="noopener">🖨️ Affiches QR code des restaurants</a></p>` : ''}

    <div class="section-title">Compte</div>
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
  const cp = $('#btn-copy-code', body);
  if (cp) cp.onclick = async () => {
    const code = state.profile?.ref_code || '';
    try { await navigator.clipboard.writeText(code); toast('Code copié ✅'); }
    catch { toast(`Ton code : ${code}`); }
  };
  const sc = $('#btn-share-code', body);
  if (sc) sc.onclick = () => openShare();
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
  $('#pseudo-form', body).onsubmit = async (ev) => {
    ev.preventDefault();
    const v = String(new FormData(ev.target).get('pseudo') || '').trim();
    const r = await api.changePseudo(v);
    if (r === 'ok') { toast('Pseudo modifié ✅'); renderAccount('reglages'); }
    else toast(r === 'Pseudo deja pris' ? 'Ce pseudo est déjà pris.' : r === 'Le pseudo doit faire 3 a 20 caracteres' ? 'Le pseudo doit faire de 3 à 20 caractères.' : r);
  };
  if ($('#test-form', body)) $('#test-form', body).onsubmit = (ev) => {
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

async function onUserChanged(user) {
  const was = state.user?.id;
  state.user = user;
  $('#btn-account').classList.toggle('logged', !!user);
  if (user && user.id !== was) {
    const fromWelcome = !$('#welcome').hidden;
    $('#welcome').hidden = true;
    if (authInWelcome) welcomeForm(false);
    if (fromWelcome) introFly();
    store.set('ydp_seen_welcome', '1');
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
  document.body.classList.remove('intro');
  renderCards();
}

// Animation d'entrée : la carte part de loin (vue de la région) et plonge sur la position.
const FAR_VIEW = { center: [6.75, 48.55], zoom: 6 };
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
    if (p) {
      firstFix = false;
      map.flyTo({ center: [p.lng, p.lat], zoom: 13.5, duration: 2600, curve: 1.6, essential: true });
    } else if (state.establishments.size) {
      // Sans GPS : dernière zone regardée, sinon la Moselle + petit choix de zone.
      const z = savedZone();
      goZone(z || 'moselle', 2400);
      if (!z) setTimeout(zonePicker, 2600);
    } else {
      showCards();
    }
  };
  // On laisse une seconde au GPS pour répondre avant de plonger.
  if (myPosition()) go(); else setTimeout(go, 900);
}

// ---------------------------------------------------------------------------
// Position de l'utilisateur
// ---------------------------------------------------------------------------
let firstFix = true;
function watchGps() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition((p) => {
    state.gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    renderMe();
    if (firstFix && state.sheetView === 'detail' && state.selectedId) renderDetail(state.selectedId);
    if (firstFix && !testPosition() && introDone) {
      firstFix = false;
      map.flyTo({ center: [state.gps.lng, state.gps.lat], zoom: 13 });
    }
  }, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 });
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
  await onUserChanged(user);
  document.body.classList.add('intro'); // liste du bas cachée jusqu'à la fin de l'animation
  map.jumpTo(FAR_VIEW); // vue lointaine : l'animation d'entrée plonge ensuite sur la position
  if (!user) showWelcome(); // écran d'accueil à chaque ouverture tant qu'on n'est pas connecté

  try {
    await loadEstablishments();
  } catch (err) {
    showOffline(navigator.onLine === false ? 'Pas de connexion internet.' : (err.message || 'Impossible de charger les restaurants.'));
    return;
  }
  $('#offline').hidden = true;
  renderMe();
  watchGps();
  const deep = new URLSearchParams(location.search).get('r');
  if (deep && state.establishments.has(deep)) {
    // Lien partagé vers un resto : on ouvre directement sa fiche.
    introDone = true;
    $('#welcome').hidden = true;
    map.jumpTo({ center: [state.establishments.get(deep).lng, state.establishments.get(deep).lat], zoom: 15 });
    showCards();
    openDetail(deep);
  } else if ($('#welcome').hidden) {
    introFly();
  }
  await refreshStatuses();
  setInterval(() => { if (!document.hidden) refreshStatuses(); }, REFRESH_MS);
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
  sheet.addEventListener('touchmove', (ev) => {
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
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
})();

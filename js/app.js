// Y'a du peuple ? — logique de l'appli (carte, fiche, signalement, compte).
import { api, DEMO } from './api.js?v=31';
import {
  MAP_STYLE_URL, DEFAULT_CENTER, DEFAULT_ZOOM, CONTACT_EMAIL,
  ROUTE_FACTOR, ROUTE_SPEED_KMH, REFRESH_MS,
} from './config.js?v=31';
import {
  LEVELS, LEVEL_INFO, WAIT_INFO, NO_INFO, levelInfo, describeStatus, mainStatus, brandShort,
  theoryLevelAt, parisNow, bestTimeToday, fmtHour, distanceM, fmtDistance, ago,
  levelFromPercent, gDay, dayHours, bestTimeFromProfile, openState, hoursLines,
} from './levels.js?v=31';
import { airbnbize, addShieldImage } from './mapstyle.js?v=31';

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

function pillHtml(e) {
  // Une seule pastille : la couleur du service le plus chargé (salle ou Drive), détail dans la fiche.
  const os = openState(state.hours?.[e.id]);
  if (os && !os.open) return `<span class="dot" style="background:#9CA3AF"></span>${esc(brandShort(e))}`;
  const d = describeStatus(mainStatus(e));
  const live = d.isLive ? ' live' : '';
  return `<span class="dot${live}" style="background:${d.info.color};color:${d.info.color}"></span>${esc(brandShort(e))}`;
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
  }
  applyZoomClass();
  updateClusters();
}

// ---------------------------------------------------------------------------
// Regroupement des pastilles trop proches (« 3 restos »)
// ---------------------------------------------------------------------------
const CLUSTER_PX = 46;
const clusterMarkers = [];
function updateClusters() {
  for (const c of clusterMarkers) c.remove();
  clusterMarkers.length = 0;
  const pts = [];
  for (const e of state.establishments.values()) {
    const m = state.markers.get(e.id);
    if (!m) continue;
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
    el.className = 'pill cluster';
    el.setAttribute('aria-label', `${members.length} restaurants`);
    el.innerHTML = `<span class="dot" style="background:${worst.color}"></span>${members.length}`;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); openCluster(members); });
    clusterMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map));
  }
}
map.on('moveend', updateClusters);

function openCluster(members) {
  const b = new maplibregl.LngLatBounds();
  members.forEach((e) => b.extend([e.lng, e.lat]));
  const cam = map.cameraForBounds(b, { padding: 90 });
  // Si zoomer permet de les séparer, on zoome ; sinon on affiche la liste.
  if (cam && cam.zoom > map.getZoom() + 0.6 && map.getZoom() < 16) {
    map.easeTo({ center: cam.center, zoom: Math.min(cam.zoom, 17), duration: 450 });
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
    const results = await Promise.allSettled(coverPoints().map((p) => api.nearby(p.lat, p.lng, 5000, 50)));
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
  const visible = [...state.establishments.values()].filter((e) => b.contains([e.lng, e.lat]));
  if (!visible.length) {
    box.innerHTML = '<div class="cards-empty">Aucun restaurant dans cette zone. Dézoome ou déplace la carte.</div>';
    return;
  }
  const list = visible
    .map((e) => ({ e, d: distanceM(ref.lat, ref.lng, e.lat, e.lng) }))
    .sort((a, b2) => a.d - b2.d)
    .slice(0, 60);
  const fromMe = !!myPosition();
  box.innerHTML = `<div class="cards-count">${visible.length}<small>resto${visible.length > 1 ? 's' : ''}<br>ici</small></div>` + list.map(({ e, d }) => `
    <button class="card" data-id="${e.id}" type="button">
      <p class="card-title">${esc(e.name)}</p>
      <div class="card-sub">${esc(e.city)}${fromMe ? ` · ${fmtDistance(d)}` : ''}${openLabelHtml(e)}</div>
      <div class="card-row">
        ${e.has_dine_in ? chipHtml('Salle', e.status_salle) : ''}
        ${e.has_drive ? chipHtml('Drive', e.status_drive) : ''}
      </div>
    </button>`).join('');
}
$('#cards').addEventListener('click', (ev) => {
  const c = ev.target.closest('.card');
  if (c) openDetail(c.dataset.id);
});
let cardsTimer;
map.on('moveend', () => { clearTimeout(cardsTimer); cardsTimer = setTimeout(renderCards, 150); });

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
  $('#sheet').hidden = false;
  $('#backdrop').hidden = false;
  $('#sheet-body').scrollTop = 0;
  requestAnimationFrame(updateScrollHints);
  $('#cards').style.visibility = 'hidden';
}
function closeSheet() {
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
  const url = e ? `${APP_URL}?r=${e.id}` : APP_URL;
  const text = e
    ? `${e.name} : y'a du peuple en ce moment ? Regarde l'affluence en direct 👉`
    : "Y'a du peuple ? L'affluence des fast-foods en direct, salle et Drive 🍔👉";
  const full = `${text} ${url}`;
  const u = encodeURIComponent(url), t = encodeURIComponent(full);
  const links = [
    ['WhatsApp', '#25D366', `https://wa.me/?text=${t}`],
    ['Snapchat', '#FFFC00', `https://www.snapchat.com/scan?attachmentUrl=${u}`],
    ['Facebook', '#1877F2', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['Messenger', '#0084FF', `fb-messenger://share/?link=${u}`],
    ['X', '#000000', `https://twitter.com/intent/tweet?text=${t}`],
    ['Telegram', '#229ED9', `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text)}`],
    ['SMS', '#14B8A6', `sms:?&body=${t}`],
    ['E-mail', '#0B1F3A', `mailto:?subject=${encodeURIComponent("Y'a du peuple ?")}&body=${t}`],
  ];
  openSheet('share', `
    <div class="sheet-head">
      <div class="grow"><h2>${e ? 'Partager ce resto' : 'Inviter des amis'}</h2><div class="sub">Plus on est nombreux à signaler, plus l'info est fiable.</div></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    ${navigator.share ? `<button class="btn btn-primary" id="share-native">${ICON.share}Partager… (Instagram, WhatsApp, Snap…)</button>` : ''}
    <div class="share-grid">${links.map(([n, c, href]) => `
      <a class="share-item" href="${href}" target="_blank" rel="noopener"><span class="share-ico" style="background:${c};color:${c === '#FFFC00' ? '#000' : '#fff'}">${n[0]}</span>${n}</a>`).join('')}
      <button type="button" class="share-item" id="share-copy"><span class="share-ico" style="background:#E5E7EB;color:#0B1F3A">🔗</span>Copier le lien</button>
    </div>
    <p class="muted" style="font-size:12.5px;margin-top:10px">Instagram : utilise « Partager… » ou copie le lien pour le coller en story ou en message.</p>`);
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

function routeHtml(e) {
  const p = myPosition();
  if (!p) {
    return `<div class="route"><button type="button" class="chip chip-btn" id="btn-route-gps">📍 Voir le temps de trajet</button></div>`;
  }
  const d = distanceM(p.lat, p.lng, e.lat, e.lng);
  const min = Math.max(1, Math.round(((d * ROUTE_FACTOR) / 1000 / ROUTE_SPEED_KMH) * 60));
  const parts = [`<span class="chip">📍 ${fmtDistance(d)}</span>`];
  if (d > 150) parts.push(`<span class="chip">🚗 ≈ ${min} min de trajet</span>`);
  if (e.has_drive) {
    const w = e.status_drive?.wait && WAIT_INFO[e.status_drive.wait];
    parts.push(w
      ? `<span class="chip">+ file au Drive : ${w.short} voitures</span>`
      : `<span class="chip chip-muted">File au Drive : pas d'info récente</span>`);
  }
  return `<div class="route">${parts.join('')}</div>`;
}

function renderDetail(id) {
  const e = state.establishments.get(id);
  if (!e) return;
  const profile = detailExtra.get(id)?.profile || null;
  const best = profile ? bestTimeFromProfile(profile) : bestTimeToday();
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
    ${e.has_dine_in ? serviceBlock(e, 'salle') : ''}
    ${e.has_drive ? serviceBlock(e, 'drive') : ''}
    ${calmer ? `<div class="hint">💡 ${esc(calmer)}</div>` : ''}
    ${best ? `<div class="hint">🕐 Meilleur moment dans les 3 h : <strong>vers ${fmtHour(best.t)}</strong> (${esc(LEVEL_INFO[best.level].label.toLowerCase())} d'habitude)</div>` : ''}
    ${curveHtml(e, profile)}
    <button class="btn btn-primary" id="btn-report">J'y suis : je signale l'affluence</button>
  `;
  openSheet('detail', html);
  $('#btn-close').onclick = closeSheet;
  $('#btn-report').onclick = () => openReport(id);
  const gpsBtn = document.querySelector('#btn-route-gps');
  if (gpsBtn) gpsBtn.onclick = () => { toast('Autorise la localisation pour voir le trajet.'); watchGps(); };
  document.querySelectorAll('#sheet-body .day-tab').forEach((b) => b.onclick = () => { curveDay = Number(b.dataset.day); renderDetail(id); });
  $('#btn-fav').onclick = () => toggleFav(id);
  $('#btn-share').onclick = () => openShare(e);
}

// Centre le resto dans la partie de carte visible au-dessus de la fiche.
function focusResto(e) {
  const sheetH = Math.min(window.innerHeight * 0.62, 640);
  map.flyTo({
    center: [e.lng, e.lat],
    zoom: Math.max(map.getZoom(), 15),
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
    } catch (err) { render(err.message); return; }
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

async function renderAccount(tab = 'badges') {
  await refreshProfile();
  const p = state.profile || { pseudo: '…', points: 0, level_name: '', next_level_at: null };
  const pct = p.next_level_at ? Math.min(100, Math.round((p.points / p.next_level_at) * 100)) : 100;
  openSheet('account', `
    <div class="sheet-head">
      <div class="grow"><h2>Mon compte</h2></div>
      <button class="round-btn" id="btn-close" aria-label="Fermer">${ICON.close}</button>
    </div>
    <div class="profile-card">
      <div class="profile-top">
        <div class="avatar">${esc((p.pseudo || '?').slice(0, 1).toUpperCase())}</div>
        <div class="grow">
          <div class="pseudo">${esc(p.pseudo)}</div>
          <div class="lvl">Niveau ${p.level ?? 1} · ${esc(p.level_name)}${p.member_since ? ` · membre depuis ${new Date(p.member_since).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}` : ''}</div>
        </div>
        <button class="round-btn light" id="btn-invite" aria-label="Inviter des amis">${ICON.share}</button>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <small>${p.points} points${p.next_level_at ? ` · encore ${p.next_level_at - p.points} pour le niveau suivant` : ' · niveau maximum 🎉'}</small>
      <div class="stats">
        <div><strong>${p.reports_total ?? 0}</strong><span>signalements</span></div>
        <div><strong>${p.restos_total ?? 0}</strong><span>restos</span></div>
        <div><strong>${(p.badges || []).length}</strong><span>badges</span></div>
      </div>
      ${p.top_resto ? `<div class="top-resto">⭐ Ton resto le plus signalé : <strong>${esc(p.top_resto)}</strong></div>` : ''}
    </div>
    <div class="tabs" role="tablist">
      ${[['badges', 'Badges'], ['classement', 'Classement'], ['favoris', 'Favoris'], ['reglages', 'Réglages']]
        .map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    <div id="tab-body"><div class="spinner"></div></div>
  `);
  $('#btn-close').onclick = closeSheet;
  $('#btn-invite').onclick = () => openShare();
  $('#sheet-body').querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => renderAccount(b.dataset.tab));
  const body = $('#tab-body');
  try {
    if (tab === 'badges') body.innerHTML = await badgesHtml();
    if (tab === 'classement') { await renderLeaderboard(body); return; }
    if (tab === 'favoris') { body.innerHTML = await favoritesHtml(); bindFavList(body); }
    if (tab === 'reglages') { body.innerHTML = settingsHtml(); bindSettings(body); }
  } catch (err) {
    body.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

async function badgesHtml() {
  const rows = await api.badgesProgress() || [];
  if (!rows.length) return '<p class="muted">Aucun badge pour le moment.</p>';
  return `<ul class="list">${rows.map((b) => {
    const prog = b.is_active && b.target_value ? Math.round((b.current_value / b.target_value) * 100) : 0;
    const sub = !b.is_active ? 'Bientôt disponible' : b.earned ? 'Obtenu ✅' : `${b.current_value} / ${b.target_value}`;
    return `<li style="${b.is_active ? '' : 'opacity:.5'}">
      <span class="badge-ico ${b.earned ? 'on' : ''}">${b.earned ? '🏅' : b.is_active ? '🎯' : '🔒'}</span>
      <div class="grow"><div class="t">${esc(b.name)}</div><div class="s">${esc(b.description)} · ${sub}</div>
      ${b.is_active && !b.earned ? `<div class="mini-progress"><div style="width:${prog}%"></div></div>` : ''}</div>
    </li>`;
  }).join('')}</ul>`;
}

async function renderLeaderboard(body, city = null, days = 7) {
  const cities = [...new Set([...state.establishments.values()].map((e) => e.city))].sort((a, b) => a.localeCompare(b, 'fr'));
  body.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <select class="select" id="lb-city"><option value="">Toute la zone</option>${cities.map((c) => `<option ${c === city ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select class="select" id="lb-days"><option value="7" ${days === 7 ? 'selected' : ''}>7 jours</option><option value="30" ${days === 30 ? 'selected' : ''}>30 jours</option></select>
    </div>
    <div id="lb-list"><div class="spinner"></div></div>`;
  const reload = () => renderLeaderboard(body, $('#lb-city').value || null, Number($('#lb-days').value));
  $('#lb-city').onchange = reload;
  $('#lb-days').onchange = reload;
  const rows = await api.leaderboard(city, days) || [];
  $('#lb-list').innerHTML = rows.length ? `<ul class="list">${rows.map((r) => `
    <li class="${r.is_me ? 'me-row' : ''}"><span class="rank">${r.rang <= 3 ? ['🥇', '🥈', '🥉'][r.rang - 1] : r.rang}</span>
    <div class="grow"><div class="t">${esc(r.pseudo)}${r.is_me ? ' (moi)' : ''}</div></div><strong>${r.points_periode} pts</strong></li>`).join('')}</ul>`
    : '<p class="muted">Personne n\'a encore gagné de points sur cette période. À toi de jouer !</p>';
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

function settingsHtml() {
  const t = testPosition();
  return `
    <div class="section-title">Pseudo</div>
    <form id="pseudo-form" style="display:flex;gap:8px">
      <input class="select" style="flex:1;font-size:16px" name="pseudo" value="${esc(state.profile?.pseudo || '')}" minlength="3" maxlength="20">
      <button class="btn btn-dark" style="width:auto;padding:10px 16px">OK</button>
    </form>

    <div class="section-title">Espace partenaire</div>
    <p class="muted">Vous gérez un restaurant ? Mise en avant, offre du jour, statistiques d'affluence : écrivez-nous.</p>
    <p><a class="link-btn" href="mailto:${CONTACT_EMAIL}?subject=Partenariat%20Y'a%20du%20peuple">${CONTACT_EMAIL}</a></p>

    ${isTester() ? `<div class="section-title">Mode test</div>
    <p class="muted">Position fictive « latitude, longitude » pour tester sans être sur place. Vide = vrai GPS.</p>
    <form id="test-form" style="display:flex;gap:8px">
      <input class="select" style="flex:1;font-size:16px" name="pos" placeholder="49.3581, 6.1378" value="${t ? `${t.lat}, ${t.lng}` : ''}">
      <button class="btn btn-dark" style="width:auto;padding:10px 16px">OK</button>
    </form>` : ''}

    <div class="section-title">Confidentialité</div>
    <p class="muted">Tu peux récupérer une copie de tes données (pseudo, signalements, badges, favoris) ou supprimer ton compte à tout moment.</p>
    <button type="button" class="link-btn" id="btn-export">Télécharger mes données</button>
    <a class="link-btn" href="confidentialite.html" style="display:block">Règles de confidentialité</a>
    <button class="btn btn-ghost" id="btn-logout">Se déconnecter</button>
    <button class="btn btn-danger" id="btn-delete">Supprimer mon compte</button>
    <div id="delete-box"></div>
  `;
}

function bindSettings(body) {
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
function showWelcome() {
  const w = $('#welcome');
  w.hidden = false;
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

// Animation d'entrée : la carte part de loin (vue de la région) et plonge sur la position.
const FAR_VIEW = { center: [6.35, 49.0], zoom: 6.2 };
let introDone = false;
function introFly() {
  if (introDone) return;
  introDone = true;
  const go = () => {
    const p = myPosition();
    if (p) {
      firstFix = false;
      map.flyTo({ center: [p.lng, p.lat], zoom: 13.5, duration: 2600, curve: 1.6, essential: true });
    } else if (state.establishments.size) {
      const b = new maplibregl.LngLatBounds();
      state.establishments.forEach((e) => b.extend([e.lng, e.lat]));
      map.fitBounds(b, { padding: { top: 80, bottom: 170, left: 30, right: 30 }, duration: 2400 });
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
$('#btn-locate').addEventListener('click', () => {
  const p = myPosition();
  if (p) map.flyTo({ center: [p.lng, p.lat], zoom: 14 });
  else { toast('Autorise la localisation pour te situer.'); watchGps(); }
});

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
async function start() {
  if (DEMO) $('#demo-banner').hidden = false;
  api.onAuthChange(onUserChanged);
  const user = await api.getUser().catch(() => null);
  await onUserChanged(user);
  map.jumpTo(FAR_VIEW); // vue lointaine : l'animation d'entrée plonge ensuite sur la position
  if (!user) showWelcome(); // écran d'accueil à chaque ouverture tant qu'on n'est pas connecté

  try {
    await loadEstablishments();
  } catch (err) {
    toast(err.message || 'Impossible de charger les restaurants.', 5000);
    return;
  }
  renderMe();
  watchGps();
  const deep = new URLSearchParams(location.search).get('r');
  if (deep && state.establishments.has(deep)) {
    // Lien partagé vers un resto : on ouvre directement sa fiche.
    introDone = true;
    $('#welcome').hidden = true;
    map.jumpTo({ center: [state.establishments.get(deep).lng, state.establishments.get(deep).lat], zoom: 15 });
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
window.__ydp = { state, map, openDetail, openReport, openAccount, openSearch, openShare, renderAccount };

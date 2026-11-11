// Recolore le fond de carte OpenFreeMap « liberty » pour se rapprocher du rendu Airbnb :
// campagne vert pâle, villes gris chaud, eau bleu clair, routes blanches, autoroutes en cartouche rouge.

const C = {
  land: '#E4EED3',       // campagne
  town: '#F2F0EB',       // zones bâties
  green: '#D3E6BC',      // bois, parcs
  water: '#B7DDF2',
  road: '#FFFFFF',
  casing: '#DCD9D2',
  rail: '#CFCCC6',
  building: '#E8E5DF',
  label: '#6F6F6F',
  labelCity: '#4A4A4A',
  shield: '#D93A3A',
};

const HIDE = [
  /^natural_earth$/, /^poi_/, /^airport$/, /one_way/, /hatching/, /^road_area_pattern$/,
  /^building-3d$/, /^highway-shield-us/, /^road_shield_us$/, /^label_country/, /^label_state$/,
  /^boundary_disputed$/, /^aeroway/,
];

function setPaint(l, key, value) {
  l.paint = l.paint || {};
  l.paint[key] = value;
}

export function airbnbize(_previous, style) {
  style.layers = style.layers.filter((l) => !HIDE.some((re) => re.test(l.id)));
  for (const l of style.layers) {
    const id = l.id;
    if (l.type === 'background') setPaint(l, 'background-color', C.land);
    else if (id === 'landuse_residential') { setPaint(l, 'fill-color', C.town); setPaint(l, 'fill-opacity', 1); }
    else if (/^(park|landcover_wood|landcover_grass|landcover_wetland|landuse_pitch|landuse_cemetery)$/.test(id)) {
      setPaint(l, 'fill-color', C.green); setPaint(l, 'fill-opacity', 1);
    }
    else if (id === 'park_outline') l.layout = { ...(l.layout || {}), visibility: 'none' };
    else if (/^(landuse_hospital|landuse_school|landuse_track|landcover_sand|landcover_ice)$/.test(id)) {
      setPaint(l, 'fill-color', C.town);
    }
    else if (id === 'water') setPaint(l, 'fill-color', C.water);
    else if (l.type === 'line' && /^waterway/.test(id)) setPaint(l, 'line-color', C.water);
    else if (id === 'building') { setPaint(l, 'fill-color', C.building); setPaint(l, 'fill-outline-color', C.casing); }
    else if (/^boundary_[23]$/.test(id)) {
      // Frontières (pays, départements, communes) : trait gris foncé en pointillés
      setPaint(l, 'line-color', id === 'boundary_2' ? '#5B6170' : '#7C8290');
      setPaint(l, 'line-opacity', 0.9);
      setPaint(l, 'line-width', id === 'boundary_2' ? ['interpolate', ['linear'], ['zoom'], 5, 1.2, 12, 2.4] : ['interpolate', ['linear'], ['zoom'], 7, 0.8, 13, 1.6]);
      setPaint(l, 'line-dasharray', [3, 2]);
    }
    else if (l.type === 'line' && /rail/.test(id)) setPaint(l, 'line-color', C.rail);
    else if (l.type === 'line' && /casing/.test(id)) setPaint(l, 'line-color', C.casing);
    else if (l.type === 'line' && /^(road|tunnel|bridge)_/.test(id)) setPaint(l, 'line-color', C.road);
    else if (id === 'highway-shield-non-us') {
      l.layout = {
        ...l.layout,
        'icon-image': 'ydp-shield',
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [2, 5, 2, 5],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
      };
      l.paint = { 'text-color': '#FFFFFF' };
    }
    else if (l.type === 'symbol' && /^label_(city|town|village|other)/.test(id)) {
      setPaint(l, 'text-color', /city/.test(id) ? C.labelCity : C.label);
      setPaint(l, 'text-halo-color', '#FFFFFF');
      setPaint(l, 'text-halo-width', 1.4);
      if (l.layout) l.layout['icon-image'] = undefined;
    }
    else if (l.type === 'symbol' && /name/.test(id)) {
      setPaint(l, 'text-color', C.label);
      setPaint(l, 'text-halo-color', '#FFFFFF');
    }
  }
  for (const l of style.layers) if (l.layout) for (const k of Object.keys(l.layout)) if (l.layout[k] === undefined) delete l.layout[k];
  return style;
}

// Cartouche rouge à bord blanc (étirable) pour les numéros d'autoroute (A4, A31…).
export function addShieldImage(map) {
  if (map.hasImage('ydp-shield')) return;
  const r = window.devicePixelRatio > 1 ? 2 : 1;
  const w = 24 * r, h = 20 * r;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const rad = 4 * r;
  const path = (x, y, ww, hh, rr) => {
    g.beginPath();
    g.moveTo(x + rr, y); g.arcTo(x + ww, y, x + ww, y + hh, rr); g.arcTo(x + ww, y + hh, x, y + hh, rr);
    g.arcTo(x, y + hh, x, y, rr); g.arcTo(x, y, x + ww, y, rr); g.closePath();
  };
  g.fillStyle = '#FFFFFF'; path(0, 0, w, h, rad); g.fill();
  g.fillStyle = '#D93A3A'; path(2 * r, 2 * r, w - 4 * r, h - 4 * r, rad - r); g.fill();
  map.addImage('ydp-shield', g.getImageData(0, 0, w, h), {
    pixelRatio: r,
    stretchX: [[6 * r, 18 * r]],
    stretchY: [[6 * r, 14 * r]],
    content: [4 * r, 3 * r, 20 * r, 17 * r],
  });
}

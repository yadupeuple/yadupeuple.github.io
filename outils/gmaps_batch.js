// Relevé en masse des courbes Google Maps (15/11/2026). À exécuter dans un onglet https://www.google.com/maps?hl=fr
// File d'attente : localStorage.ydp_q = JSON [[id, requête, lat, lng], ...] ; résultats : localStorage.ydp_res (JSON lignes).
// Envoi en base toutes les 45 s : fonction RPC temporaire import_gmaps_batch(jeton, lignes) → import.gmaps_raw
// (jeton dans import.secrets, jamais dans le dépôt). File construite depuis l'API publique (restos sans courbe, Moselle d'abord).
// Chaque fiche est ouverte dans une iframe de même origine ; 3 en parallèle. Vérifie que le lieu trouvé est à < 500 m.
(() => {
  if (window.ydpRun) return 'déjà lancé';
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const re = /(\d+)\s*%\s*à\s*(\d+)\s*h/, reL = /actuel de \d+\s*%\s*\((\d+)\s*%/;
  // Attente via un Web Worker : les minuteries d'un onglet en arrière-plan sont ralenties par Chrome (×10 et plus),
  // celles d'un worker non. (Sans ça : 135 fiches en 1 h 35 ; avec : ~50 / min.)
  const tw = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
  const cbs = {}; let n = 0; tw.onmessage = (e) => { const f = cbs[e.data]; delete cbs[e.data]; f && f(); };
  const sleep = (ms) => new Promise((r) => { const id = ++n; cbs[id] = r; tw.postMessage({ id, ms }); });
  const dist = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.hypot(x, y) * R; };
  const load = () => JSON.parse(localStorage.ydp_q || '[]');
  const done = () => new Set((localStorage.ydp_res || '').split('\n').filter(Boolean).map((l) => JSON.parse(l).id));
  const save = (o) => { localStorage.ydp_res = (localStorage.ydp_res || '') + JSON.stringify(o) + '\n'; };
  function extract(d, href) {
    const m = href.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
    const ll = m ? [+m[1], +m[2]] : null;
    const gs = [...d.querySelectorAll('.g2BVhd')];
    const ferme = (d.body.innerText.match(/(Définitivement|Temporairement) fermé/) || [''])[0];
    if (!gs.length) return { ll, prof: null, ferme };
    const vis = Math.max(0, gs.findIndex((g) => g.offsetParent !== null));
    const lab = [...d.querySelectorAll('button[aria-label],div[role="button"][aria-label]')].map((b) => b.getAttribute('aria-label').toLowerCase()).find((t) => DAYS.includes(t));
    const d0 = lab ? DAYS.indexOf(lab) : new Date().getDay();
    const prof = new Array(168).fill(null); const per = [];
    gs.forEach((g, i) => {
      const day = (d0 + i - vis + 70) % 7; let prev = null, off = 0, any = false;
      g.querySelectorAll('[aria-label*="%"]').forEach((b) => {
        const t = b.getAttribute('aria-label'); let h, v; const mm = t.match(re);
        if (mm) { v = +mm[1]; h = +mm[2]; } else { const l = t.match(reL); if (!l || prev == null) return; h = (prev + 1) % 24; v = +l[1]; }
        if (prev != null && h < prev) off = 1; prev = h;
        if (v > 0) { prof[((day + off) % 7) * 24 + h] = v; any = true; }
      });
      per[day] = any;
    });
    // jour sans données Google : on reprend la veille
    for (let k = 0; k < 14; k++) { const day = k % 7; if (per[day] === false) { const pd = (day + 6) % 7; if (per[pd]) { for (let h = 6; h < 24; h++) prof[day * 24 + h] = prof[pd * 24 + h]; per[day] = true; } } }
    return { ll, prof: prof.some((x) => x != null) ? prof : null, ferme };
  }
  async function one(item) {
    const [id, q, lat, lng] = item;
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:900px;opacity:0.02;pointer-events:none;z-index:-1';
    f.src = 'https://www.google.com/maps/search/' + encodeURIComponent(q) + '/@' + lat + ',' + lng + ',16z?hl=fr';
    document.body.appendChild(f);
    let res = { id, err: 'timeout' };
    try {
      for (let t = 0; t < 30; t++) {
        await sleep(500);
        const d = f.contentDocument; if (!d || !d.body) continue;
        if (f.contentWindow.location.pathname.startsWith('/sorry') || d.querySelector('#captcha-form') || /trafic inhabituel|unusual traffic/i.test(d.body.innerText.slice(0, 1500))) { res = { id, err: 'captcha' }; window.ydpStop = true; break; }
        const list = d.querySelectorAll('a.hfpxzc');
        if (!d.querySelector('h1') && list.length && t > 4) {
          // liste de résultats : on prend le plus proche
          let best = null, bd = 1e9;
          list.forEach((a) => { const m = a.href.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/); if (m) { const dd = dist(lat, lng, +m[1], +m[2]); if (dd < bd) { bd = dd; best = a; } } });
          if (best && bd < 500) { f.contentWindow.location.href = best.href; t = 0; await sleep(1500); continue; }
          res = { id, err: 'liste' }; break;
        }
        if (d.querySelector('h1') && (d.querySelector('.g2BVhd') || t > 12)) {
          await sleep(700);
          const x = extract(d, f.contentWindow.location.href);
          if (x.ll && dist(lat, lng, x.ll[0], x.ll[1]) > 500) { res = { id, err: 'loin', d: Math.round(dist(lat, lng, x.ll[0], x.ll[1])) }; break; }
          res = { id, nm: d.querySelector('h1').textContent.trim(), prof: x.prof, ferme: x.ferme || undefined };
          break;
        }
      }
    } catch (e) { res = { id, err: String(e).slice(0, 60) }; }
    f.remove();
    return res;
  }
  window.ydpRun = true; window.ydpStop = false;
  (async () => {
    const q = load(); const ok = done(); let i = 0;
    const next = () => { while (i < q.length && ok.has(q[i][0])) i++; return i < q.length ? q[i++] : null; };
    const worker = async () => { let it; while (!window.ydpStop && (it = next())) { const r = await one(it); if (r.err !== 'captcha') save(r); await sleep(400 + Math.random() * 600); } };
    await Promise.all([worker(), worker(), worker()]);
    window.ydpRun = false;
  })();
  return 'lancé';
})();

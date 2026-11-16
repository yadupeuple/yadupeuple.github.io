// Relevé en masse des courbes Google Maps (15-16/11/2026). À exécuter dans un onglet https://www.google.com/maps?hl=fr
// File : localStorage.ydp_q = JSON [[id, requête, lat, lng], ...] ; position : localStorage.ydp_i ; résultats en attente : localStorage.ydp_res.
// Envoi en base toutes les 45 s : RPC temporaire import_gmaps_batch(jeton, lignes) → import.gmaps_raw (trigger → popular_times).
// Le jeton (import.secrets) est passé dans window.YDP_TOKEN avant de lancer, jamais écrit dans le dépôt.
// Réglages : 3 relevés en parallèle, 2,5-4 s de pause (~25-30 fiches/min) ; blocage Google → pause 30 min (4e = arrêt).
// Attente via Web Worker (les minuteries des onglets en arrière-plan sont ralenties par Chrome).
// Si l'onglet devient lent (mémoire), le recharger puis relancer ce script : il reprend à localStorage.ydp_i.
(() => {
  const gen = (window.ydpGen = (window.ydpGen || 0) + 1);
  const SB = 'https://ygekcpnsjbbdgtmlxdce.supabase.co/rest/v1/rpc/import_gmaps_batch', KEY = 'sb_publishable_jreZhBNIOsn-athEC7nOvw_xMawIRSx';
  if (!window.ydpTW) {
    window.ydpTW = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
    window.ydpTWcb = {}; window.ydpTWn = 0;
    window.ydpTW.onmessage = (e) => { const f = window.ydpTWcb[e.data]; delete window.ydpTWcb[e.data]; f && f(); };
  }
  const sleep = (ms) => new Promise((r) => { const id = ++window.ydpTWn; window.ydpTWcb[id] = r; window.ydpTW.postMessage({ id, ms }); });
  window.ydpDrain = async () => {
    const lines = (localStorage.ydp_res || '').split('\n').filter(Boolean); if (!lines.length) return 0;
    const batch = lines.slice(0, 250);
    const r = await fetch(SB, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: window.YDP_TOKEN, p_rows: batch.map((l) => JSON.parse(l)) }) });
    if (!r.ok) { window.ydpDrainErr = await r.text(); return -1; }
    const cur = (localStorage.ydp_res || '').split('\n').filter(Boolean); localStorage.ydp_res = cur.slice(batch.length).map((l) => l + '\n').join('');
    window.ydpSent = (window.ydpSent || 0) + batch.length; return batch.length;
  };
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const re = /(\d+)\s*%\s*à\s*(\d+)\s*h/, reL = /actuel de \d+\s*%\s*\((\d+)\s*%/;
  const dist = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.hypot(x, y) * R; };
  const save = (o) => { localStorage.ydp_res = (localStorage.ydp_res || '') + JSON.stringify(o) + '\n'; };
  function extract(d, href) {
    const m = href.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/); const ll = m ? [+m[1], +m[2]] : null;
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
        if (f.contentWindow.location.pathname.startsWith('/sorry') || d.querySelector('#captcha-form') || /trafic inhabituel|unusual traffic/i.test(d.body.innerText.slice(0, 1500))) { res = { id, err: 'captcha' }; break; }
        const list = d.querySelectorAll('a.hfpxzc');
        if (!d.querySelector('h1') && list.length && t > 4) {
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
    f.src = 'about:blank'; f.remove();
    return res;
  }
  window.ydpStop = false; window.ydpCaptchas = +(sessionStorage.ydp_captchas || 0); window.ydpPauseUntil = +(sessionStorage.ydp_pause || 0);
  window.ydpT0d = Date.now(); window.ydpI = +(localStorage.ydp_i || 0); window.ydpI0d = window.ydpI;
  const q = JSON.parse(localStorage.ydp_q || '[]');
  const next = () => { if (window.ydpI >= q.length) return null; const it = q[window.ydpI++]; localStorage.ydp_i = window.ydpI; return it; };
  const worker = async () => {
    while (window.ydpGen === gen && !window.ydpStop) {
      while (Date.now() < window.ydpPauseUntil && window.ydpGen === gen) await sleep(20000);
      const it = next(); if (!it) break;
      const r = await one(it);
      if (r.err === 'captcha') {
        window.ydpI = Math.min(window.ydpI, q.indexOf(it)); localStorage.ydp_i = window.ydpI;
        if (Date.now() >= window.ydpPauseUntil) {
          window.ydpCaptchas++; window.ydpLastCaptcha = new Date().toISOString(); window.ydpPauseUntil = Date.now() + 30 * 60000;
          sessionStorage.ydp_captchas = window.ydpCaptchas; sessionStorage.ydp_pause = window.ydpPauseUntil;
          if (window.ydpCaptchas > 3) window.ydpStop = true;
        }
        continue;
      }
      save(r);
      await sleep(2500 + Math.random() * 1500);
    }
  };
  Promise.all([worker(), worker(), worker()]).then(async () => {
    await window.ydpDrain(); await window.ydpDrain(); window.ydpT1 = Date.now();
  });
  (async () => { while (window.ydpGen === gen) { await sleep(45000); try { await window.ydpDrain(); } catch (e) {} } })();
  return 'lancé gen ' + gen + ' à partir de ' + window.ydpI;
})();

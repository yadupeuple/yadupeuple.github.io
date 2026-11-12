// À coller dans la console (ou via Claude in Chrome) sur une fiche Google Maps ouverte en français (&hl=fr).
// Renvoie : nom, adresse, coordonnées, courbe d'affluence (7 jours, « heure:valeur ») et horaires.
// Les jours de la courbe commencent au jour affiché par Google (souvent aujourd'hui) : l'ordre est
// donné par la liste des horaires (h), dans le même ordre.
await new Promise((r) => setTimeout(r, 3500));
const re = /(\d+)\s*%\s*à\s*(\d+)\s*h/, reL = /actuel de \d+\s*%\s*\((\d+)\s*%/;
const nm = document.querySelector('h1')?.textContent;
const ad = (document.querySelector('button[data-item-id="address"]')?.getAttribute('aria-label') || '').replace(/^Adresse:\s*/, '').trim();
const ll = (location.href.match(/!3d([\d.]+)!4d([\d.]+)/) || []).slice(1).join(',');
const g = [...document.querySelectorAll('.g2BVhd')].map((grp) => {
  const o = []; let prev = null;
  grp.querySelectorAll('[aria-label*="%"]').forEach((b) => {
    const t = b.getAttribute('aria-label'); const m = t.match(re);
    if (m) { o.push(+m[2] + ':' + m[1]); prev = +m[2]; }
    else { const l = t.match(reL); if (l && prev != null) { prev = (prev + 1) % 24; o.push(prev + ':' + l[1]); } }
  });
  return o.filter((x) => !x.endsWith(':0')).join(',');
});
document.querySelector('[data-item-id="oh"]')?.click();
await new Promise((r) => setTimeout(r, 1300));
const h = [...document.querySelectorAll('table tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  .filter((t) => /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i.test(t)).slice(0, 7);
const drive = /Service de drive/.test(document.body.innerText);
const ferme = (document.body.innerText.match(/(Définitivement|Temporairement) fermé/) || [''])[0];
JSON.stringify({ nm, ad, ll, g, h, drive, ferme });

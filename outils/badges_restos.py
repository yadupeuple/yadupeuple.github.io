"""Badges « restaurants » (17/11/2026, planche d'Alexis outils/src/badges_restos.png) : on retire le cadenas posé sur le bas
du cercle (zone refaite en reprenant l'anneau juste à côté, par rotation) et on détoure en cercle parfait, sans le halo clair.
explorer = montagne (5), explorer10 = toque (10), explorer15 = carte + boussole (15), explorer20 = route (20), explorer30 = avion (30)."""
import json, numpy as np
from PIL import Image
from scipy import ndimage
P = np.asarray(Image.open('outils/src/badges_restos.png').convert('RGB')).astype(float)
C = json.load(open('outils/src/badges_restos_cercles.json'))
for code in ['explorer', 'explorer10', 'explorer15', 'explorer20', 'explorer30']:
    cx, cy, R = C[code]
    H, W = P.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    lock = (abs(xx - cx) <= 64) & (yy >= cy + R - 40)
    rr = np.hypot(xx - cx, yy - cy); th = np.arctan2(yy - cy, xx - cx)
    img = P.copy()
    sel = lock & (rr <= R + 2) & (rr >= R - 30)   # seulement l anneau (le cadenas ne touche que lui)
    ys, xs = np.where(sel)
    out = np.zeros((len(ys), 3)); wsum = np.zeros(len(ys))
    for d in np.radians([-30, -26, 26, 30]):
        t = th[ys, xs] + d; r = rr[ys, xs]
        sx = cx + r * np.cos(t); sy = cy + r * np.sin(t)
        v = np.dstack([ndimage.map_coordinates(P[..., c], [sy, sx], order=1) for c in range(3)])[0]
        out += v; wsum += 1
    img[ys, xs] = out / wsum[:, None]
    # petit adoucissement de la zone refaite
    sm = np.dstack([ndimage.gaussian_filter(img[..., c], 0.8) for c in range(3)])
    img[sel] = sm[sel]
    # bord réel angle par angle (le cercle dessiné n'est pas parfait) : on s'arrête au dernier pixel coloré,
    # l'ombre claire sous le badge reste dehors (plus de trait blanc)
    mx_, mn_ = img.max(2), img.min(2)
    solid = ~((mn_ >= 140) & ((mx_ - mn_) <= 80))
    angs = np.linspace(-np.pi, np.pi, 1440, endpoint=False)
    edge = np.empty(len(angs))
    for k, t in enumerate(angs):
        e = R - 16
        for d in np.arange(R + 4, R - 16, -0.5):
            x = int(round(cx + d * np.cos(t))); y = int(round(cy + d * np.sin(t)))
            if solid[y, x]: e = d; break
        edge[k] = e
    zone = np.abs(angs - np.pi / 2) < 0.42          # sous l'ancien cadenas : bord recalculé à partir des côtés
    left, right = np.where(~zone & (angs < np.pi / 2))[0][-6:], np.where(~zone & (angs > np.pi / 2))[0][:6]
    i0, i1 = left[-1], right[0]; e0, e1 = np.median(edge[left]), np.median(edge[right])
    edge[i0 + 1:i1] = np.linspace(e0, e1, i1 - i0 + 1)[1:-1]
    edge = ndimage.median_filter(edge, size=31, mode='wrap')
    edge = ndimage.uniform_filter1d(edge, size=15, mode='wrap') - 0.8
    idx = ((th + np.pi) / (2 * np.pi) * len(angs)).astype(int) % len(angs)
    alpha = np.clip(edge[idx] - rr + 0.5, 0, 1) * 255
    Rc = edge.max()
    full = np.dstack([img, alpha])
    box = (round(cx - Rc - 2), round(cy - Rc - 2), round(cx + Rc + 2), round(cy + Rc + 2))
    o = Image.fromarray(full.clip(0, 255).astype('uint8'), 'RGBA').crop(box).resize((256, 256), Image.LANCZOS)
    o.save(f'icons/badges/{code}.webp', quality=94, method=6)
    print(code)

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
    Rc = R - 0.5
    alpha = np.clip(Rc - rr + 0.5, 0, 1) * 255
    full = np.dstack([img, alpha])
    box = (round(cx - Rc - 2), round(cy - Rc - 2), round(cx + Rc + 2), round(cy + Rc + 2))
    o = Image.fromarray(full.clip(0, 255).astype('uint8'), 'RGBA').crop(box).resize((256, 256), Image.LANCZOS)
    o.save(f'icons/badges/{code}.webp', quality=94, method=6)
    print(code)

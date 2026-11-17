"""Badges « villes » (17/11/2026, planche d'Alexis outils/src/badges_voyage.png) : 1 Tour de la zone (tour_zone),
2 Voyageur (tour_zone6), 3 Globe-trotteur (tour_zone10). Détourage du badge (sans le cadre ni le cadenas, sans l'ombre claire)."""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
im = Image.open('outils/src/badges_voyage.png').convert('RGB')
a = np.asarray(im).astype(float)
H, W = a.shape[:2]
for i, code in enumerate(['tour_zone', 'tour_zone6', 'tour_zone10']):
    x0, x1 = i * W // 3 + 50, (i + 1) * W // 3 - 50
    sub = a[30:555, x0:x1]
    mx, mn = sub.max(2), sub.min(2)
    # pixels du badge : assez loin du blanc du fond (l'ombre bleu très clair et le cadre gris restent dehors)
    dist = np.sqrt(((sub - 252) ** 2).sum(2))
    m = (dist > 55) | ((mx - mn) > 45)
    m = ndimage.binary_closing(m, iterations=2)
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    m = np.isin(lab, [k + 1 for k, s in enumerate(sizes) if s > sizes.max() * 0.01])
    m = ndimage.binary_fill_holes(m)
    pale = ((mx - mn) <= 60) & (mn >= 140)        # ombre claire grise / bleutée sous le badge
    for _ in range(30):
        border = m & ~ndimage.binary_erosion(m)
        peel = border & pale
        if not peel.any(): break
        m &= ~peel
    m = ndimage.binary_opening(m, iterations=1)
    ys, xs = np.where(m)
    al = Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8))
    rgba = Image.fromarray(sub.astype('uint8')).convert('RGBA'); rgba.putalpha(al)
    side = max(xs.max() - xs.min(), ys.max() - ys.min()) + 6
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    out.alpha_composite(rgba.crop((round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))))
    out.resize((256, 256), Image.LANCZOS).save(f'icons/badges/{code}.webp', quality=94, method=6)
    print(code, side)

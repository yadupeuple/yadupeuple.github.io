"""Badges ronds : contour refait en cercle parfait et lisse (l'ombre blanche disparaît, aucun bord haché).
Badges qui ne sont pas ronds (laurier, ruban, couronne…) : image d'origine gardée telle quelle.
Originaux : outils/src/badges_avant_ombre/. Usage : python3 outils/badge_sans_ombre.py"""
import glob, os, shutil
import numpy as np
from PIL import Image
from scipy import ndimage
NOT_ROUND = {'regulier8', 'regulier12', 'testeur', 'tour_zone', 'tour_zone6', 'tour_zone10'}  # dessins qui dépassent du rond
for f in sorted(glob.glob('outils/src/badges_avant_ombre/*.webp')):
    code = os.path.basename(f)[:-5]
    im = Image.open(f).convert('RGBA'); a = np.asarray(im).astype(float)
    rgb, al = a[..., :3], a[..., 3]
    mx, mn = rgb.max(2), rgb.min(2)
    core = (al > 200) & ~(((mx - mn) <= 55) & (mn >= 150))   # pixels colorés (pas l'ombre claire)
    core = ndimage.binary_fill_holes(ndimage.binary_opening(core, iterations=2))
    ys, xs = np.where(core)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    r = (xs.max() - xs.min() + ys.max() - ys.min()) / 4
    H, W = al.shape; yy, xx = np.mgrid[0:H, 0:W]; rr = np.hypot(xx - cx + 0.5, yy - cy + 0.5)
    disc = rr < r
    fill = (core & disc).sum() / disc.sum(); outside = (core & ~disc).sum() / disc.sum()
    if fill < 0.96 or outside > 0.03 or code in NOT_ROUND:
        shutil.copy(f, f'icons/badges/{code}.webp'); print(code, 'pas rond → original', round(fill, 3), round(outside, 3)); continue
    R = r - 1.0                                   # juste à l'intérieur du bord coloré
    alpha = np.clip(R - rr + 0.5, 0, 1) * 255     # bord lisse (anticrénelage d'un pixel)
    out = np.dstack([rgb, alpha])
    # recadrage centré sur le cercle
    pad = 1
    box = (round(cx - R - pad), round(cy - R - pad), round(cx + R + pad), round(cy + R + pad))
    o = Image.fromarray(out.clip(0, 255).astype('uint8'), 'RGBA').crop(box).resize((256, 256), Image.LANCZOS)
    o.save(f'icons/badges/{code}.webp', quality=94, method=6)
    print(code, 'rond', round(fill, 3), round(outside, 3))

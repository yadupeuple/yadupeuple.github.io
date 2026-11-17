"""Comme badge_detoure.py, mais épluche aussi l'ombre grise/claire autour du badge (planches de novembre 2026).
Usage : python3 outils/badge_detoure2.py outils/src/badges_semaines/semaines_4.png regulier8"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src, code = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(int)
mx, mn = a.max(axis=2), a.min(axis=2)
mask = mn < 235
mask = ndimage.binary_fill_holes(ndimage.binary_closing(mask, iterations=4))
lab, k = ndimage.label(mask)
big = (lab == (np.argmax(ndimage.sum(mask, lab, range(1, k + 1))) + 1))
pale = ((mx - mn) <= 60) & (mn >= 150)   # ombre grise / bleutée claire
for _ in range(40):
    border = big & ~ndimage.binary_erosion(big)
    peel = border & pale
    if not peel.any(): break
    big &= ~peel
big = ndimage.binary_opening(big, iterations=2)
lab, k = ndimage.label(big); big = lab == (np.argmax(ndimage.sum(big, lab, range(1, k + 1))) + 1)
big = ndimage.binary_fill_holes(big)
ys, xs = np.where(big)
cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 4
box = tuple(round(v) for v in (cx - r, cy - r, cx + r, cy + r))
alpha = Image.fromarray((big * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))
out = im.convert('RGBA'); out.putalpha(alpha)
out = out.crop(box).resize((256, 256), Image.LANCZOS)
out.save(f'icons/badges/{code}.webp', quality=92, method=6)
print(code, box)

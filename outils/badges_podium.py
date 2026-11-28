"""Badges du podium mensuel (planche d'Alexis du 28/11/2026, fond noir) : bronze, argent, or → podium3, podium2, podium1.
Détourage selon la forme réelle, sans retouche du dessin. Usage : python3 outils/badges_podium.py"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
im = Image.open('outils/src/badges_podium.png').convert('RGB')
a = np.asarray(im).astype(int)
mask = a.max(axis=2) > 22
mask = ndimage.binary_fill_holes(ndimage.binary_closing(mask, iterations=3))
lab, k = ndimage.label(mask)
sizes = ndimage.sum(mask, lab, range(1, k + 1))
top = sorted(np.argsort(sizes)[-3:] + 1, key=lambda l: np.where(lab == l)[1].mean())
for code, l in zip(['podium3', 'podium2', 'podium1'], top):
    big = lab == l
    ys, xs = np.where(big)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 4
    box = tuple(round(v) for v in (cx - r, cy - r, cx + r, cy + r))
    alpha = Image.fromarray((big * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.0))
    out = im.convert('RGBA'); out.putalpha(alpha)
    out.crop(box).resize((256, 256), Image.LANCZOS).save(f'icons/badges/{code}.webp', quality=92, method=6)
    print(code, box)

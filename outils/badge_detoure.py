"""Badge ChatGPT dont le dessin dépasse du disque (ex. carte) : détourage selon la forme réelle, sans retouche.
Usage : python3 outils/badge_detoure.py outils/src/badge_tour_zone10.png tour_zone10"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src, code = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(int)
mask = a.min(axis=2) < 235
mask = ndimage.binary_fill_holes(ndimage.binary_closing(mask, iterations=4))
lab, k = ndimage.label(mask)
big = (lab == (np.argmax(ndimage.sum(mask, lab, range(1, k + 1))) + 1))
ys, xs = np.where(big)
cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 4
box = tuple(round(v) for v in (cx - r, cy - r, cx + r, cy + r))
alpha = Image.fromarray((big * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))
out = im.convert('RGBA'); out.putalpha(alpha)
out = out.crop(box).resize((256, 256), Image.LANCZOS)
out.save(f'icons/badges/{code}.webp', quality=92, method=6)
print(code, box)

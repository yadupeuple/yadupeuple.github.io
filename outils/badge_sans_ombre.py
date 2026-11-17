"""Retire l'ombre blanche / grise claire autour des badges déjà découpés (icons/badges/*.webp), puis recentre.
Originaux gardés dans outils/src/badges_avant_ombre/. Usage : python3 outils/badge_sans_ombre.py"""
import glob, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
for f in sorted(glob.glob('outils/src/badges_avant_ombre/*.webp')):
    code = os.path.basename(f)[:-5]
    im = Image.open(f).convert('RGBA')
    a = np.asarray(im).astype(int)
    rgb, al = a[..., :3], a[..., 3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    solid = al > 40
    pale = ((mx - mn) <= 55) & (mn >= 150) | (al < 200)   # blanc / gris clair, ou bord à moitié transparent
    big = solid.copy()
    for _ in range(14):
        border = big & ~ndimage.binary_erosion(big)
        peel = border & pale
        if not peel.any(): break
        big &= ~peel
    big = ndimage.binary_opening(big, iterations=2)
    lab, k = ndimage.label(big)
    big = lab == (np.argmax(ndimage.sum(big, lab, range(1, k + 1))) + 1)
    big = ndimage.binary_fill_holes(big)
    ys, xs = np.where(big)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 2
    alpha = Image.fromarray((big * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.9))
    alpha = Image.fromarray(np.minimum(np.asarray(alpha), al).astype('uint8'))
    rgbim = im.convert('RGB')
    out = rgbim.convert('RGBA'); out.putalpha(alpha)
    # Couleur des pixels de bord : reprise de l'intérieur (pas de liseré clair)
    box = (cx - r, cy - r, cx + r, cy + r)
    out = out.crop(tuple(round(v) for v in box)).resize((256, 256), Image.LANCZOS)
    out.save(f'icons/badges/{code}.webp', quality=92, method=6)
    print(code, round(r), int(al.sum()/255) - int(big.sum()), 'px retirés')

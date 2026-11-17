"""Recentre le dessin de chaque avatar au milieu de sa bulle turquoise. Le dessin n'est pas retouché, seulement déplacé ;
la bulle est reconstituée à partir de ses propres couleurs (même dégradé). Originaux : outils/src/avatars_avant_centrage/.
Usage : python3 outils/avatar_centrer.py"""
import glob, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
for f in sorted(glob.glob('outils/src/avatars_avant_centrage/*.webp')):
    code = os.path.basename(f)[:-5]
    im = Image.open(f).convert('RGBA'); a = np.asarray(im).astype(float)
    H, W = a.shape[:2]; rgb, al = a[..., :3], a[..., 3]
    ys, xs = np.where(al > 128)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    R = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2
    yy, xx = np.mgrid[0:H, 0:W]; rr = np.hypot(xx - cx, yy - cy)
    r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # fond de bulle = turquoise clair (vert et bleu forts, rouge plus faible)
    bg = (al > 128) & (g_ > 200) & (b_ > 200) & (g_ - r_ > 25) & (b_ - r_ > 25) & (abs(g_ - b_) < 35)
    subj = (al > 128) & ~bg & (rr < R * 0.92)
    subj = ndimage.binary_opening(subj, iterations=1)
    subj = ndimage.binary_closing(subj, iterations=2)
    subj = ndimage.binary_fill_holes(subj)
    lab, k = ndimage.label(subj)
    sizes = ndimage.sum(subj, lab, range(1, k + 1))
    subj = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(80, sizes.max() * 0.03)])
    sy, sx = np.where(subj)
    # le cadre du dessin est placé pile au centre de la bulle
    dx = round(cx - (sx.min() + sx.max()) / 2); dy = round(cy - (sy.min() + sy.max()) / 2)
    # bulle sans dessin : on remplit le trou en étalant les couleurs voisines (garde le dégradé)
    known = bg.astype(float)
    num = rgb * known[..., None]; den = known.copy()
    for s in (3, 6, 12, 24, 48):
        n2 = np.dstack([ndimage.gaussian_filter(num[..., c], s) for c in range(3)]); d2 = ndimage.gaussian_filter(den, s)
        fill = n2 / np.maximum(d2, 1e-6)[..., None]
        if s == 3: est = fill
        else: est = np.where((d2 > 1e-3)[..., None] & ~np.isfinite(est).all(2, keepdims=True), fill, est)
    hole_w = (ndimage.gaussian_filter(den, 3) < 0.5)
    for s in (6, 12, 24, 48):
        n2 = np.dstack([ndimage.gaussian_filter(num[..., c], s) for c in range(3)]); d2 = ndimage.gaussian_filter(den, s)
        est = np.where(hole_w[..., None], n2 / np.maximum(d2, 1e-6)[..., None], est)
        hole_w &= d2 < 0.05
    base = np.where(bg[..., None], rgb, est)
    base = np.dstack([ndimage.gaussian_filter(base[..., c], 2.5) for c in range(3)])
    soft = np.asarray(Image.fromarray((ndimage.binary_dilation(subj, iterations=1) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.9))) / 255.0
    sh = lambda arr: np.roll(np.roll(arr, dy, 0), dx, 1)
    s_rgb, s_soft = sh(rgb), sh(soft)[..., None]
    out = base * (1 - s_soft) + s_rgb * s_soft
    Image.fromarray(np.dstack([out, al]).clip(0, 255).astype('uint8'), 'RGBA').save(f'icons/avatars/{code}.webp', quality=92, method=6)
    print(code, dx, dy, end=' | ')

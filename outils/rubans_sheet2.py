"""Rubans de profil, 2e lot (planches ChatGPT d'Alexis, 16/11/2026), découpés tels quels, fond rendu transparent.
Même méthode que rubans_sheet.py (vrai fond blanc, épluchage des gris d'ombre, pas de bouchage des trous gris).
Usage : python3 outils/rubans_sheet2.py (depuis la racine du site)."""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SHEETS = {
    # colonne gauche de haut en bas, puis colonne droite ; None = ruban non retenu
    'outils/src/rubans_sheet2.png': ['ruban_nuit', 'ruban_turquoise', 'ruban_violet', 'ruban_ciel', 'ruban_laurier',
                                     'ruban_bonbon', 'ruban_orange', 'ruban_damier', 'ruban_vache', 'ruban_flammes'],
    'outils/src/rubans_sheet3.png': ['ruban_couronne', 'ruban_etoile_violet', None, 'ruban_flamme_violet', 'ruban_engrenage',
                                     'ruban_diamant', 'ruban_fleurs', 'ruban_coeur', 'ruban_etoile_or', 'ruban_flocon'],
}

def cut(path, codes):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    mx, mn = a.max(axis=2), a.min(axis=2)
    neutral = ((mx - mn) <= 45) & (mn >= 100)          # gris / blanc (ombre, halo)
    pale = (mn >= 170) & ((mx - mn) <= 80)               # ombre bleutée très claire (planche 2)
    light = (mn >= 236) & ((mx - mn) <= 20)             # vrai fond blanc
    lab, _ = ndimage.label(light)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))

    def fill_small(m):
        holes = ndimage.binary_fill_holes(m) & ~m
        hl, k = ndimage.label(holes)
        for j in range(1, k + 1):
            h = hl == j
            if neutral[h].mean() < 0.5 or h.sum() < 40: m = m | h
        return m

    def clean(m):
        for _ in range(40):  # épluche depuis le bord tous les pixels gris/blancs
            border = m & ~ndimage.binary_erosion(m)
            peel = border & (neutral | pale)
            if not peel.any(): break
            m = m & ~peel
        greyish = (mn >= 60) & ((mx - mn) <= 80)
        for _ in range(3):   # liseré gris sous le contour
            below_empty = np.zeros_like(m); below_empty[:-1] = ~m[1:]
            peel = m & greyish & below_empty
            if not peel.any(): break
            m = m & ~peel
        m = ndimage.binary_opening(m, iterations=2)
        l2, k = ndimage.label(m)
        if k > 1:
            sz = ndimage.sum(m, l2, range(1, k + 1)); m = np.isin(l2, [j + 1 for j, v in enumerate(sz) if v >= sz.max() * 0.03])
        return fill_small(m)

    fg = fill_small(~bg)
    lab2, k = ndimage.label(ndimage.binary_dilation(fg, iterations=1))
    sizes = ndimage.sum(fg, lab2, range(1, k + 1))
    keep = np.argsort(sizes)[::-1][:10] + 1
    boxes = [(ndimage.find_objects((lab2 == i).astype(int))[0], i) for i in keep]
    boxes = sorted(boxes, key=lambda t: (t[0][1].start > a.shape[1] / 2, t[0][0].start))
    for code, (b, i) in zip(codes, boxes):
        if not code: continue
        mask = clean(ndimage.binary_erosion(fg & (lab2 == i), iterations=2))
        alpha = Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.7))
        rgba = im.convert('RGBA'); rgba.putalpha(alpha)
        ys, xs = np.nonzero(mask)
        crop = rgba.crop((max(0, xs.min() - 4), max(0, ys.min() - 4), min(a.shape[1], xs.max() + 5), min(a.shape[0], ys.max() + 5)))
        w = 900; crop = crop.resize((w, round(crop.height * w / crop.width)), Image.LANCZOS)
        crop.save(f'icons/banners/{code}.webp', quality=92, method=6)
        print(code, crop.size)

if __name__ == '__main__':
    for p, c in SHEETS.items(): cut(p, c)

# Finition (planche 3) : ombre colorée restée sous certains rubans. On épluche, dans le bas du ruban
# seulement, les pixels clairs du bord ; le contour foncé du ruban arrête l'épluchage.
BOTTOM_PEEL = {'ruban_flamme_violet': 0.55, 'ruban_engrenage': 0.55, 'ruban_diamant': 0.55, 'ruban_etoile_or': 0.45}
def bottom_peel(code, frac):
    p = f'icons/banners/{code}.webp'
    im = Image.open(p).convert('RGBA'); a = np.asarray(im).astype(int)
    m = a[..., 3] > 20; lum = a[..., :3].mean(axis=2)
    zone = np.zeros_like(m); zone[int(m.shape[0] * frac):] = True
    for _ in range(25):
        border = m & ~ndimage.binary_erosion(m)
        peel = border & zone & (lum > 105)
        if not peel.any(): break
        m = m & ~peel
    m = ndimage.binary_opening(m, iterations=1)
    l2, k = ndimage.label(m)
    if k > 1:
        sz = ndimage.sum(m, l2, range(1, k + 1)); m = np.isin(l2, [j + 1 for j, v in enumerate(sz) if v >= sz.max() * 0.02])
    alpha = np.minimum(a[..., 3], np.asarray(Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6))))
    out = np.dstack([a[..., :3], alpha]).astype('uint8')
    Image.fromarray(out, 'RGBA').save(p, quality=92, method=6)

if __name__ == '__main__':
    for c, f in BOTTOM_PEEL.items(): bottom_peel(c, f)

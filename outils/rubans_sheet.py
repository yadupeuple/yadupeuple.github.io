"""Rubans de profil (planche ChatGPT d'Alexis, 15/11/2026) découpés tels quels, fond rendu transparent.
Usage : python3 outils/rubans_sheet.py (depuis la racine du site)."""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
im = Image.open('outils/src/rubans_sheet.png').convert('RGB')
a = np.asarray(im).astype(int)
# fond = zones très claires reliées au bord de l'image
# fond + ombre grise + liseré blanc : pixels clairs et peu colorés reliés au bord (15/11 : retire les « ratures »)
light = (a.min(axis=2) >= 236) & ((a.max(axis=2) - a.min(axis=2)) <= 20)  # vrai fond blanc seulement
lab, _ = ndimage.label(light)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(edge))
def fill_small(m):
    # bouche les trous SAUF ceux qui sont gris/blancs (ombre coincée sous le ruban)
    holes = ndimage.binary_fill_holes(m) & ~m
    lab, k = ndimage.label(holes)
    for j in range(1, k + 1):
        h = lab == j
        if (neutral_all[h].mean() < 0.5) or h.sum() < 40: m = m | h
    return m
neutral_all = ((a.max(axis=2) - a.min(axis=2)) <= 45) & (a.min(axis=2) >= 100)
fg = fill_small(~bg)
lab2, k = ndimage.label(ndimage.binary_dilation(fg, iterations=1))
sizes = ndimage.sum(fg, lab2, range(1, k + 1))
keep = np.argsort(sizes)[::-1][:10] + 1
boxes = [(ndimage.find_objects((lab2 == i).astype(int))[0], i) for i in keep]
boxes = sorted(boxes, key=lambda t: (t[0][1].start > a.shape[1] / 2, t[0][0].start))  # colonne gauche puis droite, de haut en bas
codes = ['ruban_or', 'ruban_bleu', 'ruban_vert', 'ruban_rose', 'ruban_outils',
         'ruban_royal', 'ruban_rouge', 'ruban_argent', 'ruban_obsidienne', 'ruban_trophee']
neutral = ((a.max(axis=2) - a.min(axis=2)) <= 45) & (a.min(axis=2) >= 100)  # gris / blanc (ombre, liseré)
shadowish = neutral & (a.max(axis=2) <= 240)  # gris de l'ombre (pas le blanc pur des reflets)
def clean(m):
    # v125 : on « épluche » depuis le bord les pixels gris/blancs restants, on coupe les fils fins,
    # puis on ne garde que le ruban (gros morceaux) : plus aucune rature autour.
    # on épluche depuis le bord tous les pixels gris/blancs (ombre, halo) ; le contour foncé du ruban arrête l'épluchage
    for _ in range(30):
        border = m & ~ndimage.binary_erosion(m)
        peel = border & neutral
        if not peel.any(): break
        m = m & ~peel
    # fin liseré gris-bleu restant sous le contour (transition contour / ombre)
    greyish = (a.min(axis=2) >= 60) & ((a.max(axis=2) - a.min(axis=2)) <= 80)
    for _ in range(3):
        below_empty = np.zeros_like(m); below_empty[:-1] = ~m[1:]
        peel = m & greyish & below_empty
        if not peel.any(): break
        m = m & ~peel
    m = ndimage.binary_opening(m, iterations=2)
    lab, k = ndimage.label(m)
    if k > 1:
        sz = ndimage.sum(m, lab, range(1, k + 1)); m = np.isin(lab, [j + 1 for j, v in enumerate(sz) if v >= sz.max() * 0.03])
    return fill_small(m)
for code, (b, i) in zip(codes, boxes):
    mask = clean(ndimage.binary_erosion(fg & (lab2 == i), iterations=2))
    alpha = Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.7))
    rgba = im.convert('RGBA'); rgba.putalpha(alpha)
    y0, y1, x0, x1 = b[0].start, b[0].stop, b[1].start, b[1].stop
    crop = rgba.crop((max(0, x0 - 4), max(0, y0 - 4), min(a.shape[1], x1 + 4), min(a.shape[0], y1 + 4)))
    w = 900; crop = crop.resize((w, round(crop.height * w / crop.width)), Image.LANCZOS)
    crop.save(f'icons/banners/{code}.webp', quality=92, method=6)
    print(code, crop.size)

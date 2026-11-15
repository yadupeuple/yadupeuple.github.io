"""Rubans de profil (planche ChatGPT d'Alexis, 15/11/2026) découpés tels quels, fond rendu transparent.
Usage : python3 outils/rubans_sheet.py (depuis la racine du site)."""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
im = Image.open('outils/src/rubans_sheet.png').convert('RGB')
a = np.asarray(im).astype(int)
# fond = zones très claires reliées au bord de l'image
light = a.min(axis=2) >= 215
lab, _ = ndimage.label(light)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(edge))
fg = ndimage.binary_fill_holes(~bg)
lab2, k = ndimage.label(ndimage.binary_dilation(fg, iterations=1))
sizes = ndimage.sum(fg, lab2, range(1, k + 1))
keep = np.argsort(sizes)[::-1][:10] + 1
boxes = [(ndimage.find_objects((lab2 == i).astype(int))[0], i) for i in keep]
boxes = sorted(boxes, key=lambda t: (t[0][1].start > a.shape[1] / 2, t[0][0].start))  # colonne gauche puis droite, de haut en bas
codes = ['ruban_or', 'ruban_bleu', 'ruban_vert', 'ruban_rose', 'ruban_outils',
         'ruban_royal', 'ruban_rouge', 'ruban_argent', 'ruban_obsidienne', 'ruban_trophee']
for code, (b, i) in zip(codes, boxes):
    mask = ndimage.binary_erosion(lab2 == i, iterations=1) & fg
    alpha = Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.7))
    rgba = im.convert('RGBA'); rgba.putalpha(alpha)
    y0, y1, x0, x1 = b[0].start, b[0].stop, b[1].start, b[1].stop
    crop = rgba.crop((max(0, x0 - 4), max(0, y0 - 4), min(a.shape[1], x1 + 4), min(a.shape[0], y1 + 4)))
    w = 900; crop = crop.resize((w, round(crop.height * w / crop.width)), Image.LANCZOS)
    crop.save(f'icons/banners/{code}.webp', quality=92, method=6)
    print(code, crop.size)

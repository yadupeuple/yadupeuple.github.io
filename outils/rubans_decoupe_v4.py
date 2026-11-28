"""Rubans de profil : nouvelle découpe (28/11/2026, demande d'Alexis : plus aucune trace sur les bords, rien de redessiné).
Les rubans des planches ChatGPT ont tous un contour foncé ; derrière : fond blanc, halo blanc et ombre lavande.
1) objet = tout ce qui est enfermé par le contour (pixels colorés ou foncés, trous bouchés) ;
2) bord : le liseré clair/gris qui reste à l'extérieur du contour est retiré, et les pixels du bord prennent
   la couleur du contour voisin (pas de halo clair) ; transparence lissée sur 1 pixel seulement.
3) taille d'origine × 1,3 (900 px de large), sans flou ni retouche du dessin.
Les anciennes images sont gardées dans outils/src/rubans_avant_v3/.
v4 (28/11) : ce qui dépasse du contour foncé (lueurs, halos clairs, éclats) est retiré, sauf les gros morceaux colorés.
Usage : python3 outils/rubans_decoupe_v4.py [dossier de sortie]"""
import os, shutil
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SHEETS = {
    'outils/src/rubans_sheet.png':  [None, None, 'ruban_vert', None, None, None, None, None, None, None],
    'outils/src/rubans_sheet2.png': ['ruban_nuit', 'ruban_turquoise', 'ruban_violet', 'ruban_ciel', 'ruban_laurier',
                                     'ruban_bonbon', 'ruban_orange', 'ruban_damier', 'ruban_vache', 'ruban_flammes'],
    'outils/src/rubans_sheet3.png': ['ruban_couronne', 'ruban_etoile_violet', None, 'ruban_flamme_violet', 'ruban_engrenage',
                                     'ruban_diamant', 'ruban_fleurs', 'ruban_coeur', 'ruban_etoile_or', 'ruban_flocon'],
}
OUT_W = 900
import sys
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else 'icons/banners'

def cut(path, codes):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(float)
    mx, mn = a.max(axis=2), a.min(axis=2)
    lum = a @ [0.299, 0.587, 0.114]
    sat = (mx - mn) / np.maximum(mx, 1)
    # pixels qui appartiennent sûrement au dessin : bien colorés, ou foncés (contour)
    core = ((sat > 0.45) & (mx > 60)) | ((sat > 0.32) & (lum < 150)) | (lum < 125)
    # fond = clair et peu coloré, relié au bord de l'image (blanc, halo, ombre lavande)
    light = ~core
    lab, _ = ndimage.label(light)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    obj = ~bg
    # trous : bouchés sauf s'ils sont de l'ombre / du fond coincés (clairs et peu colorés, assez grands)
    holes = ndimage.binary_fill_holes(obj) & ~obj
    hl, nh = ndimage.label(holes)
    for j in range(1, nh + 1):
        h = hl == j
        shade = (~core[h]).mean() > 0.8 and (sat[h] < 0.25).mean() > 0.8 and (lum[h] > 150).mean() > 0.8
        if not (shade and h.sum() >= 30): obj |= h
    obj = ndimage.binary_opening(obj, iterations=1)
    lab2, k = ndimage.label(ndimage.binary_dilation(obj, iterations=3))
    sizes = ndimage.sum(obj, lab2, range(1, k + 1))
    keep = np.argsort(sizes)[::-1][:10] + 1
    boxes = sorted([(ndimage.find_objects((lab2 == i).astype(int))[0], i) for i in keep],
                   key=lambda t: (t[0][1].start > a.shape[1] / 2, t[0][0].start))
    for code, (b, i) in zip(codes, boxes):
        if not code: continue
        m = obj & (lab2 == i)
        # garde seulement le gros morceau (et les ornements de taille notable)
        l3, k3 = ndimage.label(m)
        if k3 > 1:
            sz = ndimage.sum(m, l3, range(1, k3 + 1))
            m = np.isin(l3, [j + 1 for j, v in enumerate(sz) if v >= sz.max() * 0.02])
        # épluche depuis l'extérieur le liseré clair / peu coloré resté hors du contour
        for _ in range(15):
            border = m & ~ndimage.binary_erosion(m)
            peel = border & ~core
            if not peel.any(): break
            m = m & ~peel
        # v4 : tout ce qui est hors du contour foncé est du fond (halo, lueur), sauf les gros morceaux colorés sans contour
        dark0 = m & (lum < 115)
        enc = ndimage.binary_fill_holes(ndimage.binary_closing(dark0, iterations=2)) & m
        outs = m & ~enc
        oo = ndimage.binary_opening(outs, iterations=2)
        lo, ko = ndimage.label(oo)
        big = np.zeros_like(oo)
        if ko:
            so = ndimage.sum(oo, lo, range(1, ko + 1))
            big = np.isin(lo, [j + 1 for j, v in enumerate(so) if v >= 300])
        m = enc | (ndimage.binary_dilation(big, iterations=2) & outs)
        m = ndimage.binary_opening(m, iterations=1)
        l3, k3 = ndimage.label(m)
        if k3 > 1:
            sz = ndimage.sum(m, l3, range(1, k3 + 1))
            m = np.isin(l3, [j + 1 for j, v in enumerate(sz) if v >= sz.max() * 0.01])
        # couleur du bord = couleur du contour foncé le plus proche (supprime tout halo clair)
        dark = m & (lum < 125)
        dist_in = ndimage.distance_transform_edt(m)
        dd, (iy, ix) = ndimage.distance_transform_edt(~dark, return_indices=True)
        rgb = a.copy()
        band = m & (dist_in <= 2.5) & ~dark & (dd <= 4)
        rgb[band] = a[iy[band], ix[band]]
        # extension de 1 px de la couleur du contour vers l'extérieur (pour l'anticrénelage)
        ring = ndimage.binary_dilation(m, iterations=2) & ~m & (dd <= 6)
        rgb[ring] = a[iy[ring], ix[ring]]
        alpha = np.asarray(Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6))).astype(float)
        out = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha]).astype('uint8'), 'RGBA')
        ys, xs = np.nonzero(m)
        crop = out.crop((max(0, xs.min() - 3), max(0, ys.min() - 3), min(a.shape[1], xs.max() + 4), min(a.shape[0], ys.max() + 4)))
        crop = crop.resize((OUT_W, round(crop.height * OUT_W / crop.width)), Image.LANCZOS)
        dst = f'{OUT_DIR}/{code}.webp'
        os.makedirs('outils/src/rubans_avant_v3', exist_ok=True)
        if OUT_DIR == 'icons/banners' and os.path.exists(dst) and not os.path.exists(f'outils/src/rubans_avant_v3/{code}.webp'):
            shutil.copy(dst, f'outils/src/rubans_avant_v3/{code}.webp')
        crop.save(dst, quality=95, method=6)
        print(code, crop.size)

if __name__ == '__main__':
    for p, c in SHEETS.items(): cut(p, c)

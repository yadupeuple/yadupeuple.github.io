"""Badges refaits par ChatGPT (12/11/2026), découpés sans retouche : disque détouré, fond transparent.
Usage : python3 outils/badges_sheet2.py (depuis la racine du site)."""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

def discs(path, n):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    mask = a.min(axis=2) < 225
    mask = ndimage.binary_fill_holes(ndimage.binary_closing(mask, iterations=3))
    lab, k = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, k + 1))
    keep = np.argsort(sizes)[::-1][:n] + 1
    boxes = [ndimage.find_objects((lab == i).astype(int))[0] for i in keep]
    boxes = [(b[1].start, b[0].start, b[1].stop, b[0].stop) for b in boxes]
    boxes.sort(key=lambda b: (round(b[1] / 300), b[0]))  # lignes puis colonnes
    return im, boxes

OUT = 256
def save(im, box, code):
    x0, y0, x1, y1 = box
    cx, cy, rad = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2 + 2
    crop = im.crop((round(cx - rad), round(cy - rad), round(cx + rad), round(cy + rad))).resize((OUT, OUT), Image.LANCZOS)
    S = OUT * 4
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse((6, 6, S - 6, S - 6), fill=255)
    crop.putalpha(m.resize((OUT, OUT), Image.LANCZOS))
    crop.save(f'icons/badges/{code}.webp', quality=92, method=6)
    print(code, box)

im, b = discs('outils/src/badges_sheet2.png', 4)
for code, box in zip(['v10', 'drive10', 'explorer10', 'ref1'], b):  # mégaphone, carte+jumelles, toque, poignée de main
    save(im, box, code)
im, b = discs('outils/src/badge_tour_zone.png', 1)
save(im, b[0], 'tour_zone')  # itinéraire sur carte
im, b = discs('outils/src/badge_tour_zone6.png', 1)
save(im, b[0], 'tour_zone6')  # Globe-trotteur (14/11/2026) : carte + épingles sur globe

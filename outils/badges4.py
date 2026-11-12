"""4 badges : on garde le dessin central des badges ChatGPT (sans texte ni lauriers)
et on le pose sur un médaillon rond dans le style de la planche (fond dégradé + anneau)."""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
src = Image.open('src/badges4.png').convert('RGB')
OUT, S = 256, 1024          # taille finale, taille de travail
# code : (zone du dessin dans l'image, centre du disque d'origine pour la couleur)
ITEMS = {
  'v10':        ((270, 62, 625, 330), (440, 250)),
  'drive10':    ((938, 44, 1262, 312), (1095, 250)),
  'explorer10': ((292, 560, 604, 818), (440, 740)),
  'ref1':       ((938, 548, 1256, 816), (1095, 740)),
}
COLOR_PTS = {'v10': [(-120, -150)], 'drive10': [(-120, -150)], 'explorer10': [(-120, -150), (150, -170)], 'ref1': [(-120, -150)]}
def medallion(rgb):
    c = np.array(rgb, float)
    yy, xx = np.mgrid[0:S, 0:S] / S
    d = np.hypot(xx - .5, yy - .5)
    g = np.hypot(xx - .45, yy - .38)
    light = np.clip(1.55 - g * 1.5, .72, 1.5)[..., None]
    img = np.clip(c * light, 0, 255)
    ring = (d > .44) & (d <= .49)
    shade = np.clip(1.5 - (yy * .9), .8, 1.4)[..., None]
    img[ring] = np.clip((c * 1.15 + 45) * shade, 0, 255)[ring]
    img[(d > .43) & (d <= .44)] = np.clip(c * .55, 0, 255)
    img[(d > .49) & (d <= .5)] = np.clip(c * .5, 0, 255)
    a = (d <= .5).astype(float) * 255
    return Image.fromarray(np.dstack([img, a]).astype('uint8'), 'RGBA')
for code, (box, ctr) in ITEMS.items():
    if len(sys.argv) > 1 and code not in sys.argv[1:]: continue
    # couleur du fond : médiane d'un anneau autour du dessin, dans le disque d'origine
    a = np.asarray(src).astype(int)
    cx, cy = ctr
    # échantillon dans le fond du disque, entre le dessin et l'anneau (zone sans lauriers ni étoiles)
    pts = [(cx + dx, cy + dy) for dx, dy in COLOR_PTS[code]]
    base = np.median(np.array([a[y - 3:y + 4, x - 3:x + 4].reshape(-1, 3) for x, y in pts]).reshape(-1, 3), 0)
    med = medallion(base)
    art = src.crop(box)
    w, h = art.size
    sc = (S * .74) / max(w, h)
    art = art.resize((round(w * sc), round(h * sc)), Image.LANCZOS)
    # masque ovale adouci : supprime les bords (lauriers, coins) et fond le dessin dans le médaillon
    m = Image.new('L', art.size, 0)
    pad = 0.03
    ImageDraw.Draw(m).ellipse((art.size[0] * pad, art.size[1] * pad, art.size[0] * (1 - pad), art.size[1] * (1 - pad)), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(art.size[0] * .05))
    pos = ((S - art.size[0]) // 2, (S - art.size[1]) // 2 + 6)
    inner = Image.new('L', (S, S), 0); ImageDraw.Draw(inner).ellipse((S * .06, S * .06, S * .94, S * .94), fill=255)
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); layer.paste(art.convert('RGBA'), pos, m)
    la = np.asarray(layer).copy(); la[..., 3] = np.minimum(la[..., 3], np.asarray(inner))
    med.alpha_composite(Image.fromarray(la))
    med.resize((OUT, OUT), Image.LANCZOS).save(f'out/badges/{code}.webp', quality=92, method=6)
    print(code, base.astype(int))

"""Images de profil v2 (17/11/2026) : planche d'Alexis outils/src/planche_profil_v2.png (40 images, 8 × 5).
Chaque bulle est découpée (cercles repérés : outils/src/planche_profil_v2_bulles.json), agrandie ×4 (Real-ESRGAN anime 6B),
détourée en cercle lisse, puis le dessin est recentré dans sa bulle (déplacé, jamais redessiné).
Anciennes images : outils/src/avatars_v1/. Usage (depuis /home/claude/art pour le modèle) :
  python3 /home/claude/yadupeuple/outils/avatars_v2.py [code]"""
import sys, json, numpy as np, onnxruntime as ort
from PIL import Image, ImageFilter
from scipy import ndimage
ROOT = '/home/claude/yadupeuple/'
sess = ort.InferenceSession('/home/claude/art/models/anime6b.onnx', providers=['CPUExecutionProvider'])
P = Image.open(ROOT + 'outils/src/planche_profil_v2.png').convert('RGB')
C = json.load(open(ROOT + 'outils/src/planche_profil_v2_bulles.json'))
NO_RECENTER = set()
COLOR_MASK = {'milkshake'}
OUTLINE_ONLY = {'vacances', 'montagne'}   # tache abîmée au-dessus du palmier (planche) : on ne garde que ce qui est cerné de foncé   # verre transparent + bulles détachées : dessin repéré par ses couleurs   # paysage qui remplit la bulle
only = sys.argv[1:]

def up4(img):
    pad = 8
    a = np.asarray(img).astype(np.float32) / 255
    a = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode='reflect')
    o = sess.run(None, {'input': a.transpose(2, 0, 1)[None]})[0][0].transpose(1, 2, 0)
    return Image.fromarray((np.clip(o, 0, 1) * 255 + .5).astype(np.uint8)[pad * 4:-pad * 4, pad * 4:-pad * 4])

S = 320
# Fond turquoise d'avant (bulle des anciennes images, reprise des tacos) : demande d'Alexis du 17/11
def turquoise_base():
    t = np.asarray(Image.open(ROOT + 'outils/src/avatars_avant_centrage/tacos.webp').convert('RGB').resize((S, S), Image.LANCZOS)).astype(float)
    r_, g_, b_ = t[..., 0], t[..., 1], t[..., 2]
    bgm = (g_ > 200) & (b_ > 200) & (g_ - r_ > 25) & (b_ - r_ > 25) & (abs(g_ - b_) < 35)
    known = bgm.astype(float); num = t * known[..., None]
    out = t.copy(); hole = ~bgm
    for s_ in (6, 12, 24, 48, 96):
        n2 = np.dstack([ndimage.gaussian_filter(num[..., c], s_) for c in range(3)]); d2 = ndimage.gaussian_filter(known, s_)
        ok = hole & (d2 > 0.05); out[ok] = (n2 / np.maximum(d2, 1e-6)[..., None])[ok]; hole &= ~ok
    return np.dstack([ndimage.gaussian_filter(out[..., c], 4) for c in range(3)])
TURQ = turquoise_base()
for code, (cx, cy, r) in C.items():
    if only and code not in only: continue
    m = 8
    box = (round(cx - r - m), round(cy - r - m), round(cx + r + m), round(cy + r + m))
    cache = ROOT + f'outils/src/avatars_v2_x4/{code}.png'
    try: big = Image.open(cache).convert('RGB')
    except FileNotFoundError:
        big = up4(P.crop(box)); big.save(cache)
    k = big.width / (box[2] - box[0])
    # recadrage : cercle (rayon r - 1 pour ne pas garder le bord) → 320 px
    R = (r - 1.0) * k
    ccx, ccy = (cx - box[0]) * k, (cy - box[1]) * k
    sc = (S / 2) / R
    im = big.resize((round(big.width * sc), round(big.height * sc)), Image.LANCZOS)
    ox, oy = ccx * sc - S / 2, ccy * sc - S / 2
    im = im.crop((round(ox), round(oy), round(ox) + S, round(oy) + S))
    rgb = np.asarray(im).astype(float)
    yy, xx = np.mgrid[0:S, 0:S]; rr = np.hypot(xx - S / 2 + .5, yy - S / 2 + .5)
    alpha = np.clip(S / 2 - rr, 0, 1) * 255
    if code not in NO_RECENTER:
        mx, mn = rgb.max(2), rgb.min(2)
        # dessin = tout ce qui est entouré par son trait foncé (l'ombre bleue portée reste dehors)
        dark = (mx < 115) & (rr < S / 2 * 0.93)
        if code in OUTLINE_ONLY:
            ld, nd = ndimage.label(dark); sz = ndimage.sum(dark, ld, range(1, nd + 1))
            dark = np.isin(ld, [i + 1 for i, v in enumerate(sz) if v >= sz.max() * 0.1])
        subj = ndimage.binary_fill_holes(ndimage.binary_closing(dark, iterations=3))
        if code not in OUTLINE_ONLY:
            shadow = (rgb[..., 2] > rgb[..., 0] + 40) & (rgb[..., 2] >= rgb[..., 1]) & (mn > 90)   # ombre bleue portée
            subj |= (rr < S / 2 * 0.93) & ((mx - mn) > 70) & ~shadow & ndimage.binary_dilation(subj, iterations=6)
        subj = ndimage.binary_fill_holes(ndimage.binary_closing(subj, iterations=2))
        if code in COLOR_MASK:
            subj = (rr < S / 2 * 0.9) & (((mx - mn) > 70) | (mx < 150))
            subj = ndimage.binary_fill_holes(ndimage.binary_closing(subj, iterations=3))
        lab, n = ndimage.label(subj)
        sizes = ndimage.sum(subj, lab, range(1, n + 1))
        subj = np.isin(lab, [i + 1 for i, s_ in enumerate(sizes) if s_ >= max(60, sizes.max() * (0.15 if code in OUTLINE_ONLY else 0.02))])
        if code in OUTLINE_ONLY:   # retire les petits bouts accrochés (trait fin)
            core = ndimage.binary_opening(subj, iterations=5)
            l2, n2_ = ndimage.label(core); core = l2 == (np.argmax(ndimage.sum(core, l2, range(1, n2_ + 1))) + 1)
            subj &= ndimage.binary_dilation(core, iterations=6) & (yy >= np.where(core)[0].min())
        sy, sx = np.where(subj)
        dx = round(S / 2 - (sx.min() + sx.max() + 1) / 2); dy = round(S / 2 - (sy.min() + sy.max() + 1) / 2)
        # bulle propre : couleur de fond lissée, sans ombre ni petites taches
        ring = ndimage.binary_dilation(subj, iterations=5)
        inb = (rr < S / 2 - 2) & ~ring
        med = np.median(rgb[inb], axis=0)
        odd = inb & (np.sqrt(((rgb - med) ** 2).sum(2)) > 22)          # ombres, taches
        known = (inb & ~ndimage.binary_dilation(odd, iterations=3)).astype(float)
        num = rgb * known[..., None]
        base = np.zeros_like(rgb); hole = np.ones(known.shape, bool)
        for s_ in (6, 12, 24, 48, 96):
            n2 = np.dstack([ndimage.gaussian_filter(num[..., c], s_) for c in range(3)]); d2 = ndimage.gaussian_filter(known, s_)
            ok = hole & (d2 > 0.05)
            base[ok] = (n2 / np.maximum(d2, 1e-6)[..., None])[ok]; hole &= ~ok
        base[hole] = med
        base = TURQ
        soft = np.asarray(Image.fromarray((ndimage.binary_erosion(subj, iterations=1) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.9))) / 255.0
        sh = lambda arr: np.roll(np.roll(arr, dy, 0), dx, 1)
        rgb = base * (1 - sh(soft)[..., None]) + sh(rgb) * sh(soft)[..., None]
    else:
        dx = dy = 0
    Image.fromarray(np.dstack([rgb, alpha]).clip(0, 255).astype('uint8'), 'RGBA').save(ROOT + f'icons/avatars/{code}.webp', quality=92, method=6)
    print(code, dx, dy, flush=True)

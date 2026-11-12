"""Découpe les images des planches (sans les retoucher) et les agrandit ×4 avec Real-ESRGAN (anime 6B)."""
import sys, json, numpy as np
from PIL import Image, ImageDraw
import onnxruntime as ort

only = sys.argv[1] if len(sys.argv) > 1 else None
sess = ort.InferenceSession('models/anime6b.onnx', providers=['CPUExecutionProvider'])
P = {1: Image.open('src/planche1.png').convert('RGB'), 2: Image.open('src/planche2.png').convert('RGB')}

def up4(img):
    pad = 8
    a = np.asarray(img).astype(np.float32) / 255
    a = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode='reflect')
    o = sess.run(None, {'input': a.transpose(2, 0, 1)[None]})[0][0].transpose(1, 2, 0)
    o = (np.clip(o, 0, 1) * 255 + .5).astype(np.uint8)[pad * 4:-pad * 4, pad * 4:-pad * 4]
    return Image.fromarray(o)

# (code, planche, x, y, w, h, niveau)
AV = [
 ('burger',2,46,71,95,96,1),('frites',2,174,71,97,97,1),('pizza',2,305,73,94,94,1),('soda',2,433,71,95,96,1),
 ('hotdog',2,558,71,97,96,1),('tacos',2,686,71,97,96,1),('popcorn',2,815,71,97,96,5),('donut',2,947,71,96,96,5),
 ('cupcake',2,1075,70,96,97,10),('coeur',2,47,383,96,96,10),('etoile',2,176,382,97,97,15),('voiture',2,48,227,93,95,15),
 ('chat',1,156,480,102,100,20),('chien',1,282,480,100,100,20),('panda',1,406,480,100,100,25),('renard',2,174,226,98,97,25),
 ('chouette',2,305,227,96,96,30),('ours',2,434,227,95,95,30),('trefle',2,950,383,96,97,35),('eclair',2,692,383,96,96,35),
 ('flamme',2,820,383,97,97,40),('lunettes',2,1080,384,94,95,40),('lion',2,559,227,96,95,45),('medaille',2,437,383,96,96,45),
 ('trophee',2,307,383,95,96,50),('licorne',2,687,227,96,96,60),('dragon',2,816,226,98,97,70),('diamant',2,565,383,96,96,80),
 ('couronne',2,948,227,96,96,90),('fusee',2,1078,227,93,95,100),
]
BN = [
 ('nuit',2,36,612,372,83,1),('sunset',2,421,612,371,83,5),('plage',2,805,612,373,84,10),('foret',2,37,730,372,91,15),
 ('montagne',2,422,730,371,91,20),('hiver',2,423,979,370,91,25),('printemps',2,806,979,373,91,30),('automne',2,37,979,373,91,35),
 ('ville',2,806,730,373,91,40),('vagues',2,37,1108,373,91,45),('tropical',2,806,855,373,91,50),('phare',1,521,1255,482,102,60),
 ('geometrique',2,806,1108,373,91,70),('confettis',2,423,1110,371,88,80),('retro',2,422,855,371,91,90),('espace',2,37,855,373,91,100),
]
man = []
for i, (code, p, x, y, w, h, lvl) in enumerate(AV):
    man.append(dict(kind='avatar', code=code, level=lvl, order=i))
    if only and only != code: continue
    s = max(w, h) + 4                                   # carré centré sur le rond, 2 px de marge
    cx, cy = x + w / 2, y + h / 2
    box = (round(cx - s / 2), round(cy - s / 2), round(cx - s / 2) + s, round(cy - s / 2) + s)
    big = up4(P[p].crop(box))
    S = big.size[0]
    m = Image.new('L', (S * 2, S * 2), 0)
    r = (min(w, h) / 2 - 1.5) * 8                       # masque rond (bord adouci) : hors du rond = transparent
    ImageDraw.Draw(m).ellipse((S - r, S - r, S + r, S + r), fill=255)
    big.putalpha(m.resize((S, S), Image.LANCZOS))
    c = S / 2; rr = r / 2 + 2
    big = big.crop((round(c - rr), round(c - rr), round(c + rr), round(c + rr))).resize((320, 320), Image.LANCZOS)
    big.save(f'out/avatars/{code}.webp', quality=92, method=6)
    print('avatar', code)
for i, (code, p, x, y, w, h, lvl) in enumerate(BN):
    man.append(dict(kind='banner', code=code, level=lvl, order=i))
    if only and only != code: continue
    if code == 'phare':                                  # planche 1 : partie droite, sans l'étiquette de texte incrustée
        x, w = x + 132, w - 132
        cut = round(h - w / 4.1); y, h = y + cut // 2, h - cut
    ins = 5                                              # rogne les coins arrondis de la planche
    big = up4(P[p].crop((x + ins, y + ins, x + w - ins, y + h - ins)))
    big.save(f'out/banners/{code}.webp', quality=90, method=6)
    print('banner', code, big.size)
json.dump(man, open('out/manifest.json', 'w'), indent=1)

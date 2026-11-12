"""Découpe les badges de la planche ChatGPT (sans les retoucher) : disque détouré, fond transparent."""
from PIL import Image, ImageDraw
im = Image.open('src/badges_sheet.png').convert('RGB')
BOX = """24 27 232 231|279 28 225 228|532 29 222 224|780 27 228 230|1034 27 227 226|1285 27 230 233
28 278 224 219|283 278 221 220|532 279 224 224|783 278 223 220|1036 278 224 223|1288 278 224 225
27 524 226 226|282 524 222 220|533 526 221 219|781 524 226 227|1035 524 224 225|1286 524 228 228
28 772 224 219|283 772 220 218|534 774 220 217|786 772 221 218|1036 771 227 226|1288 771 222 221"""
grid = [[tuple(map(int, c.split())) for c in row.split('|')] for row in BOX.splitlines()]
# badge de l'appli -> (ligne, colonne) dans la planche
PICK = {
 'v1': (2, 3),        # pièce d'or étoilée
 'v50': (0, 2),       # médaille bronze (10 signalements)
 'v100': (0, 1),      # médaille argent (25)
 'v250': (0, 0),      # médaille or (50)
 'v500': (0, 3),      # coupe (100)
 'explorer': (3, 4),  # montagne (5 restos)
 'tour_zone': (0, 5), # ville (3 villes)
 'tour_zone6': (3, 5),# planète (6 villes)
 'ref10': (1, 2),     # grande étoile (ambassadeur)
 'ref30': (1, 0),     # couronne (30 filleuls)
 'coup_de_feu': (1, 5),  # éclair
 'regulier': (2, 5),  # calendrier
 'fiable': (0, 4),    # bouclier
 'oeil_lynx': (1, 1), # diamant
}
OUT = 256
for code, (r, c) in PICK.items():
    x, y, w, h = grid[r][c]
    cx, cy, rad = x + w / 2, y + h / 2, min(w, h) / 2 + 1
    crop = im.crop((round(cx - rad), round(cy - rad), round(cx + rad), round(cy + rad))).resize((OUT, OUT), Image.LANCZOS)
    S = OUT * 4
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse((4, 4, S - 4, S - 4), fill=255)
    crop.putalpha(m.resize((OUT, OUT), Image.LANCZOS))
    crop.save(f'out/badges/{code}.webp', quality=92, method=6)
    print(code)

"""Image d'aperçu des liens partagés (WhatsApp, Snapchat, Messenger…) : icons/og.png, 1200×630.
Logo d'Alexis utilisé tel quel (icons/logo-complet.png). Usage : python3 outils/og_image.py"""
from PIL import Image, ImageDraw, ImageFont
W, H = 1200, 630
NAVY, TEAL = (11, 31, 58), (20, 184, 166)
im = Image.new('RGB', (W, H), 'white')
logo = Image.open('icons/logo-complet.png').convert('RGB')
logo.thumbnail((520, 520), Image.LANCZOS)
im.paste(logo, (50, (H - logo.height) // 2))
d = ImageDraw.Draw(im)
F = lambda size, w='Bold': ImageFont.truetype(f'/usr/share/fonts/opentype/inter/Inter-{w}.otf', size)
x = 610
d.text((x, 150), "L'affluence des", font=F(58, 'ExtraBold'), fill=NAVY)
d.text((x, 222), 'fast-foods en direct', font=F(58, 'ExtraBold'), fill=NAVY)
d.text((x, 318), 'Salle et Drive · Gratuit', font=F(36, 'SemiBold'), fill=TEAL)
for i, (c, t) in enumerate([((34, 197, 94), 'Calme'), ((234, 179, 8), 'Un peu de monde'), ((249, 115, 22), 'Animé'), ((239, 68, 68), "Y'a du peuple !")]):
    cx, cy = x + (i % 2) * 255, 410 + (i // 2) * 62
    d.ellipse((cx, cy, cx + 34, cy + 34), fill=c)
    d.text((cx + 48, cy - 3), t, font=F(27, 'SemiBold'), fill=NAVY)
d.rectangle((0, H - 14, W, H), fill=TEAL)
im.save('icons/og.png', optimize=True)
print('icons/og.png', im.size)

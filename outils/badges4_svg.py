"""4 badges dessinés dans le style de la planche ChatGPT : médaillon brillant à anneau clair,
fond dégradé à rayons, étincelles, objets brillants à contour foncé. Sans texte ni lauriers."""
import math, re
K = '#1E1B2E'
_hs = open('/home/claude/art/fluent/pk/package/icons/flat/handshake.svg').read()
HANDSHAKE = re.sub(r'^<svg[^>]*>', '', _hs).rsplit('</svg>', 1)[0]
OL = '<filter id="ol" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="0.6" result="d"/><feFlood flood-color="#1E1B2E"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
def O(w=5): return f'stroke="{K}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"'
def spark(x, y, s, c='#fff', op=1):
    return (f'<path d="M{x} {y-s} Q{x+s*.18} {y-s*.18} {x+s} {y} Q{x+s*.18} {y+s*.18} {x} {y+s} '
            f'Q{x-s*.18} {y+s*.18} {x-s} {y} Q{x-s*.18} {y-s*.18} {x} {y-s} Z" fill="{c}" opacity="{op}"/>')
def gloss(x, y, rx, ry, rot=-25, op=.75):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="#fff" opacity="{op}" transform="rotate({rot} {x} {y})"/>'
def medal(code, ring1, ring2, c1, c2, c3, body):
    rays = ''.join(
        f'<path d="M200 200 L{200+260*math.cos(math.radians(a-4)):.1f} {200+260*math.sin(math.radians(a-4)):.1f} '
        f'L{200+260*math.cos(math.radians(a+4)):.1f} {200+260*math.sin(math.radians(a+4)):.1f} Z" fill="#fff" opacity=".07"/>'
        for a in range(0, 360, 20))
    sp = spark(92, 120, 9) + spark(312, 104, 11) + spark(300, 300, 7) + spark(104, 292, 6, op=.8) + spark(200, 66, 6, op=.7)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs>
<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{ring1}"/><stop offset="1" stop-color="{ring2}"/></linearGradient>
<radialGradient id="b" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="{c1}"/><stop offset=".55" stop-color="{c2}"/><stop offset="1" stop-color="{c3}"/></radialGradient>
<clipPath id="in"><circle cx="200" cy="200" r="162"/></clipPath>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity=".28"/></filter>
</defs>
<circle cx="200" cy="200" r="196" fill="url(#r)"/>
<circle cx="200" cy="200" r="196" fill="none" stroke="{c3}" stroke-width="4" opacity=".6"/>
<path d="M44 150 A160 160 0 0 1 250 40" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".55"/>
<circle cx="200" cy="200" r="164" fill="{c3}"/>
<circle cx="200" cy="200" r="162" fill="url(#b)"/>
<g clip-path="url(#in)">{rays}</g>
{sp}
<g filter="url(#sh)">{body}</g>
</svg>
'''
G = '''<defs>
<linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6B6B"/><stop offset="1" stop-color="#C81E1E"/></linearGradient>
<linearGradient id="white" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C9D3E3"/></linearGradient>
<linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1F5F9"/><stop offset=".5" stop-color="#B6C2D2"/><stop offset="1" stop-color="#7B8BA3"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE57A"/><stop offset=".55" stop-color="#FFC21A"/><stop offset="1" stop-color="#E08A00"/></linearGradient>
<linearGradient id="blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5BA8FF"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient>
<linearGradient id="dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4B5563"/><stop offset="1" stop-color="#1F2937"/></linearGradient>
<radialGradient id="lens" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#BFF4FF"/><stop offset=".5" stop-color="#38BDF8"/><stop offset="1" stop-color="#0369A1"/></radialGradient>
<linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD7B0"/><stop offset="1" stop-color="#F0A974"/></linearGradient>
<linearGradient id="skin2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7C08F"/><stop offset="1" stop-color="#D98B52"/></linearGradient>
<linearGradient id="sleeve" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#1E3A8A"/></linearGradient>
'''+OL+'''</defs>'''
B = {}

# --- 5 signalements : mégaphone, fond rouge
B['v10'] = medal('v10', '#FF8A8A', '#E53935', '#FF5A4E', '#E3262B', '#9E1015', G + f'''
<g transform="rotate(-18 200 205)">
<path d="M150 236 L170 300 Q174 312 186 309 L204 304 Q214 300 211 289 L196 240 Z" fill="url(#blue)" {O(6)}/>
<rect x="96" y="176" width="64" height="70" rx="16" fill="url(#red)" {O(6)}/>
<path d="M156 182 L276 120 Q292 112 292 130 L292 292 Q292 310 276 302 L156 240 Z" fill="url(#white)" {O(6)}/>
<ellipse cx="290" cy="211" rx="24" ry="92" fill="#E2E8F0" {O(6)}/>
<ellipse cx="290" cy="211" rx="12" ry="56" fill="#94A3B8"/>
<path d="M170 190 L268 140" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".85"/>
{gloss(118, 192, 12, 6, -20)}
</g>
<g stroke="{K}" stroke-width="5" stroke-linecap="round" fill="#FFD43B">
<path d="M318 110 L346 86 L356 98 L328 122 Z"/><path d="M330 168 L366 160 L368 176 L332 184 Z"/><path d="M322 226 L352 244 L344 258 L314 240 Z"/>
</g>''')
# --- Éclaireur du Drive : carte + épingle + jumelles, fond bleu
B['drive10'] = medal('drive10', '#7FE0FF', '#1E88E5', '#4FB3FF', '#1E6FE0', '#0D3E9C', G + f'''
<path d="M84 150 L148 128 L214 150 L284 126 L314 136 L314 266 L250 288 L184 266 L114 290 L84 280 Z" fill="#F1E9D2" {O(6)}/>
<path d="M148 128 L148 270 M214 150 L214 280 M284 126 L284 268" stroke="{K}" stroke-width="4" opacity=".55"/>
<path d="M150 130 L212 152 L212 278 L150 268 Z" fill="#E3D8B8"/>
<path d="M98 248 Q130 220 160 236 T214 222 T268 200" fill="none" stroke="#3FBF5A" stroke-width="18" stroke-linecap="round" opacity=".75"/>
<path d="M226 168 Q252 160 270 176 Q284 190 300 184" fill="none" stroke="#38A3F5" stroke-width="12" stroke-linecap="round" opacity=".8"/>
<path d="M84 150 L148 128 L214 150 L284 126 L314 136 L314 266 L250 288 L184 266 L114 290 L84 280 Z" fill="none" {O(6)}/>
<path d="M200 186 C176 152 156 134 156 108 A44 44 0 0 1 244 108 C244 134 224 152 200 186 Z" fill="url(#red)" {O(6)}/>
<circle cx="200" cy="106" r="17" fill="#fff" {O(5)}/>
{gloss(178, 88, 9, 5)}
<g transform="translate(0 6)">
<rect x="188" y="226" width="34" height="34" rx="8" fill="url(#dark)" {O(5)}/>
<path d="M150 222 Q150 206 166 206 L196 206 L200 240 L196 300 L150 300 Z" fill="url(#dark)" {O(6)}/>
<path d="M214 206 L244 206 Q260 206 260 222 L260 300 L214 300 L210 240 Z" fill="url(#dark)" {O(6)}/>
<circle cx="174" cy="296" r="28" fill="#111827" {O(6)}/><circle cx="174" cy="296" r="19" fill="url(#lens)"/>
<circle cx="238" cy="296" r="28" fill="#111827" {O(6)}/><circle cx="238" cy="296" r="19" fill="url(#lens)"/>
{gloss(167, 289, 7, 4, -30, .9)}{gloss(231, 289, 7, 4, -30, .9)}
<path d="M158 216 L188 216" stroke="#9CA3AF" stroke-width="4" stroke-linecap="round"/>
</g>''')
# --- Fin gourmet : toque + fourchette + cuillère croisées, fond violet
B['explorer10'] = medal('explorer10', '#D69BFF', '#8E24D9', '#A855F7', '#7C1FD6', '#4A0E8F', G + f'''
<g transform="rotate(-40 200 282)">
<rect x="191" y="216" width="18" height="140" rx="9" fill="url(#steel)" {O(5)}/>
<path d="M170 124 L170 180 Q170 214 200 218 Q230 214 230 180 L230 124" fill="url(#steel)" {O(5)}/>
<path d="M185 124 V180 M200 124 V182 M215 124 V180" stroke="{K}" stroke-width="5" stroke-linecap="round"/>
</g>
<g transform="rotate(40 200 282)">
<rect x="191" y="220" width="18" height="136" rx="9" fill="url(#steel)" {O(5)}/>
<ellipse cx="200" cy="170" rx="33" ry="50" fill="url(#steel)" {O(5)}/>
{gloss(188, 152, 8, 18, 0, .8)}
</g>
<g transform="translate(200 112) scale(.6) translate(-200 -160)">
<path d="M144 196 Q116 196 112 166 Q108 128 146 124 Q154 88 196 92 Q216 64 248 82 Q290 88 290 126 Q318 140 300 172 Q292 194 262 196 Z" fill="url(#white)" {O(7)}/>
<path d="M146 192 L148 246 Q200 262 252 246 L256 192 Z" fill="url(#white)" {O(7)}/>
<path d="M150 228 Q200 242 252 228" fill="none" stroke="#CBD5E1" stroke-width="7"/>
<path d="M176 196 V236 M200 198 V240 M226 196 V236" stroke="#CBD5E1" stroke-width="5" stroke-linecap="round"/>
{gloss(150, 140, 16, 9, -25, .9)}
</g>''')
# --- Parrain : poignée de main (manches bleues) + couronne, fond vert
B['ref1'] = medal('ref1', '#9BF07A', '#2EA815', '#5FD13A', '#2F9E1E', '#155C10', G + f'''
<path d="M150 92 L140 140 L262 140 L252 92 L226 116 L201 78 L176 116 Z" fill="url(#gold)" {O(6)}/>
<rect x="136" y="136" width="130" height="20" rx="6" fill="url(#gold)" {O(5)}/>
<circle cx="150" cy="88" r="9" fill="#FFE57A" {O(4)}/><circle cx="201" cy="74" r="10" fill="#FFE57A" {O(4)}/><circle cx="252" cy="88" r="9" fill="#FFE57A" {O(4)}/>
<circle cx="201" cy="146" r="5" fill="#EF4444"/><circle cx="168" cy="146" r="4" fill="#22C1EE"/><circle cx="234" cy="146" r="4" fill="#22C1EE"/>
{gloss(170, 112, 10, 5, -30, .8)}
<g transform="translate(97 152) scale(6.4)" filter="url(#ol)">{HANDSHAKE}</g>''')
for k, v in B.items():
    open(f'/home/claude/yadupeuple/icons/badges/{k}.svg', 'w').write(v)
print('ok')

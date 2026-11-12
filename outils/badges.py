"""Badges dessinés pour l'appli, dans l'esprit des images de profil : médaillon rond turquoise,
objet plat et coloré, contour foncé épais, reflets blancs (style sticker)."""
K = '#1F2937'
def O(w=4): return f'stroke="{K}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"'
def shine(x, y, rx, ry, rot=-30, op=.55):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="#fff" opacity="{op}" transform="rotate({rot} {x} {y})"/>'
DEFS = '''<defs>
<radialGradient id="bg" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#E6FFFB"/><stop offset=".65" stop-color="#B9F0E8"/><stop offset="1" stop-color="#8EDFD4"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDE68A"/><stop offset=".5" stop-color="#F5B82E"/><stop offset="1" stop-color="#D97706"/></linearGradient>
<linearGradient id="silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8FAFC"/><stop offset=".5" stop-color="#CBD5E1"/><stop offset="1" stop-color="#94A3B8"/></linearGradient>
<linearGradient id="bronze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDBA74"/><stop offset=".5" stop-color="#EA8A3F"/><stop offset="1" stop-color="#B45309"/></linearGradient>
<linearGradient id="diam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E0F2FE"/><stop offset=".5" stop-color="#60A5FA"/><stop offset="1" stop-color="#2563EB"/></linearGradient>
<linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FB7185"/><stop offset="1" stop-color="#DC2626"/></linearGradient>
<linearGradient id="teal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5EEAD4"/><stop offset="1" stop-color="#0D9488"/></linearGradient>
<linearGradient id="fire" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#DC2626"/><stop offset=".55" stop-color="#F97316"/><stop offset="1" stop-color="#FBBF24"/></linearGradient>
<linearGradient id="green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86EFAC"/><stop offset="1" stop-color="#16A34A"/></linearGradient>
<linearGradient id="blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DD3FC"/><stop offset="1" stop-color="#2563EB"/></linearGradient>
<linearGradient id="brown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D6A06B"/><stop offset="1" stop-color="#92400E"/></linearGradient>
</defs>'''
def wrap(body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">{DEFS}'
            f'<circle cx="100" cy="100" r="94" fill="url(#bg)"/>'
            f'<path d="M30 70 A80 80 0 0 1 120 22" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".6"/>'
            f'{body}</svg>\n')

def medal(fill, ribbon1, ribbon2, inner):
    return f'''
<path d="M70 30 L58 30 L78 96 L96 90 Z" fill="{ribbon1}" {O()}/>
<path d="M130 30 L142 30 L122 96 L104 90 Z" fill="{ribbon2}" {O()}/>
<path d="M66 30 H134 L126 44 H74 Z" fill="{ribbon2}" {O()}/>
<circle cx="100" cy="124" r="46" fill="{fill}" {O(5)}/>
<circle cx="100" cy="124" r="34" fill="none" stroke="#fff" stroke-width="3" opacity=".55"/>
{inner}
{shine(80, 104, 12, 6)}'''
def star(cx, cy, r, fill, w=4):
    import math
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * .45
        pts.append(f'{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}')
    return f'<polygon points="{" ".join(pts)}" fill="{fill}" {O(w)}/>'

B = {}
# 1 Épingle de carte
B['v1'] = wrap(f'''
<ellipse cx="100" cy="166" rx="34" ry="9" fill="#0F766E" opacity=".35"/>
<path d="M100 168 C78 132 54 112 54 82 A46 46 0 0 1 146 82 C146 112 122 132 100 168 Z" fill="url(#red)" {O(5)}/>
<circle cx="100" cy="82" r="18" fill="#fff" {O(4)}/>
{shine(78, 62, 12, 7)}''')
# 2 Main levée
B['v10'] = wrap(f'''
<path d="M62 106 V58 a9 9 0 0 1 18 0 V96 V46 a9 9 0 0 1 18 0 V94 V52 a9 9 0 0 1 18 0 V96 V68 a9 9 0 0 1 18 0 V120
 C134 150 118 168 96 168 C76 168 64 156 54 138 L40 112 a9 9 0 0 1 15 -10 Z" fill="#FBBF7C" {O(5)}/>
<path d="M80 96 V82 M98 94 V80 M116 96 V82" stroke="#E08A3C" stroke-width="3" stroke-linecap="round"/>
<path d="M70 150 C86 160 110 160 124 146" fill="none" stroke="#E08A3C" stroke-width="3" stroke-linecap="round"/>
{shine(70, 56, 4, 9, 0, .7)}{shine(88, 44, 4, 9, 0, .7)}''')
# 3-6 Médailles
B['v50'] = wrap(medal('url(#bronze)', '#2563EB', '#3B82F6', star(100, 124, 22, '#FDE68A')))
B['v100'] = wrap(medal('url(#silver)', '#DC2626', '#EF4444', star(100, 124, 22, '#fff')))
B['v250'] = wrap(medal('url(#gold)', '#7C3AED', '#8B5CF6', star(100, 124, 22, '#FEF3C7')))
B['v500'] = wrap(medal('url(#diam)', '#0D9488', '#14B8A6',
    f'<path d="M80 114 L90 104 H110 L120 114 L100 142 Z" fill="#E0F2FE" {O(3)}/><path d="M80 114 H120 M90 104 L100 114 L110 104 M100 114 V142" stroke="{K}" stroke-width="2" fill="none"/>'))
# 7 Éclaireur du Drive : voiture devant un guichet
B['drive10'] = wrap(f'''
<rect x="104" y="44" width="62" height="70" rx="8" fill="#FDE68A" {O(5)}/>
<path d="M98 50 H172 L166 34 H104 Z" fill="url(#red)" {O(5)}/>
<rect x="116" y="60" width="38" height="26" rx="4" fill="#BAE6FD" {O(4)}/>
<path d="M44 112 L58 86 H104 L120 112 Z" fill="#BAE6FD" {O(5)}/>
<path d="M80 86 V112" stroke="{K}" stroke-width="4"/>
<rect x="28" y="108" width="122" height="38" rx="14" fill="url(#teal)" {O(5)}/>
<circle cx="60" cy="148" r="15" fill="#334155" {O(4)}/><circle cx="60" cy="148" r="6" fill="#E2E8F0"/>
<circle cx="120" cy="148" r="15" fill="#334155" {O(4)}/><circle cx="120" cy="148" r="6" fill="#E2E8F0"/>
<circle cx="142" cy="120" r="5" fill="#FDE047" {O(2)}/>
{shine(54, 116, 12, 4, 0)}''')
# 8 Boussole
B['explorer'] = wrap(f'''
<circle cx="100" cy="104" r="58" fill="url(#gold)" {O(5)}/>
<circle cx="100" cy="104" r="45" fill="#F8FAFC" {O(4)}/>
<path d="M100 34 a10 10 0 1 1 0.1 0" fill="none" {O(5)}/>
<g stroke="{K}" stroke-width="3" stroke-linecap="round"><path d="M100 64 V72 M100 136 V144 M60 104 H68 M132 104 H140"/></g>
<path d="M100 104 L116 70 L108 108 Z" fill="#EF4444" {O(3)}/>
<path d="M100 104 L84 138 L92 100 Z" fill="#334155" {O(3)}/>
<circle cx="100" cy="104" r="6" fill="#F5B82E" {O(3)}/>
{shine(78, 76, 12, 6)}''')
# 9 Carte routière dépliée
B['tour_zone'] = wrap(f'''
<path d="M36 56 L74 44 L126 60 L164 48 V146 L126 158 L74 142 L36 154 Z" fill="#DCFCE7" {O(5)}/>
<path d="M74 44 V142 M126 60 V158" stroke="{K}" stroke-width="4"/>
<path d="M74 44 L126 60 V158 L74 142 Z" fill="#BBF7D0"/>
<path d="M36 56 L74 44 L126 60 L164 48 V146 L126 158 L74 142 L36 154 Z M74 44 V142 M126 60 V158" fill="none" {O(5)}/>
<path d="M48 132 C70 120 64 96 92 94 C118 92 110 70 148 72" fill="none" stroke="#EF4444" stroke-width="5" stroke-dasharray="9 8" stroke-linecap="round"/>
<circle cx="148" cy="72" r="9" fill="#EF4444" {O(3)}/><circle cx="48" cy="132" r="7" fill="#F5B82E" {O(3)}/>''')
# 10 Poignée de main
SKIN, SKIN2, CREASE = '#FCC995', '#F5B07A', '#D98B4E'
B['ref1'] = wrap(f'''
<g transform="translate(0 -6)">
<rect x="8" y="100" width="44" height="46" rx="9" fill="url(#blue)" {O(5)} transform="rotate(-28 30 123)"/>
<rect x="148" y="100" width="44" height="46" rx="9" fill="url(#teal)" {O(5)} transform="rotate(28 170 123)"/>
<path d="M44 104 C60 88 82 80 104 82 L134 86 C144 88 144 102 134 104 L118 106 L116 128 L76 138 C62 142 50 136 44 124 Z" fill="{SKIN2}" {O(5)}/>
<path d="M156 98 C142 84 122 78 104 80 L100 136 C120 142 142 140 160 128 Z" fill="{SKIN}" {O(5)}/>
<rect x="70" y="88" width="46" height="15" rx="7.5" fill="{SKIN}" {O(4)}/>
<rect x="68" y="101" width="48" height="15" rx="7.5" fill="{SKIN}" {O(4)}/>
<rect x="70" y="114" width="46" height="15" rx="7.5" fill="{SKIN}" {O(4)}/>
<rect x="76" y="127" width="38" height="14" rx="7" fill="{SKIN}" {O(4)}/>
<path d="M54 100 C66 82 94 70 124 72 C138 73 138 90 124 90 C104 90 86 96 72 110 Z" fill="{SKIN2}" {O(4)}/>
<path d="M118 76 C124 76 128 80 128 84" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
<path d="M128 94 C136 98 140 106 140 116" fill="none" stroke="{CREASE}" stroke-width="3" stroke-linecap="round"/>

</g>
{star(44, 52, 9, "#FDE047", 3)}{star(158, 48, 7, "#FDE047", 3)}{star(150, 172, 5, "#fff", 2)}''')
# 11 Mégaphone
B['ref10'] = wrap(f'''
<path d="M50 84 L130 46 V158 L50 120 Z" fill="url(#red)" {O(5)}/>
<rect x="30" y="80" width="26" height="44" rx="8" fill="#F8FAFC" {O(5)}/>
<ellipse cx="130" cy="102" rx="14" ry="56" fill="#FECACA" {O(5)}/>
<path d="M60 120 L68 158 H86 L80 126" fill="#94A3B8" {O(4)}/>
<path d="M156 78 L172 70 M160 102 H178 M156 126 L172 134" stroke="#F5B82E" stroke-width="6" stroke-linecap="round"/>
{shine(78, 82, 14, 5, -25)}''')
# 12 Couronne étoilée
B['ref30'] = wrap(f'''
<path d="M42 140 L32 66 L72 98 L100 52 L128 98 L168 66 L158 140 Z" fill="url(#gold)" {O(5)}/>
<rect x="40" y="136" width="120" height="24" rx="6" fill="#F5B82E" {O(5)}/>
<circle cx="32" cy="62" r="9" fill="#FDE047" {O(4)}/><circle cx="100" cy="46" r="10" fill="#FDE047" {O(4)}/><circle cx="168" cy="62" r="9" fill="#FDE047" {O(4)}/>
<circle cx="72" cy="148" r="6" fill="#EF4444" {O(2)}/><circle cx="100" cy="148" r="7" fill="#14B8A6" {O(2)}/><circle cx="128" cy="148" r="6" fill="#7C3AED" {O(2)}/>
{star(100, 112, 14, "#FEF3C7", 3)}
{star(46, 34, 8, "#fff", 2.5)}{star(156, 30, 7, "#fff", 2.5)}
{shine(66, 112, 10, 5)}''')
# 13 Flamme
B['coup_de_feu'] = wrap(f'''
<path d="M100 172 C64 172 44 146 48 116 C52 88 74 76 76 46 C92 60 98 76 96 92 C108 80 112 64 110 44 C138 64 156 96 152 126 C148 154 128 172 100 172 Z" fill="url(#fire)" {O(5)}/>
<path d="M100 166 C84 166 74 152 78 138 C82 124 94 118 96 104 C112 114 122 130 120 144 C118 158 110 166 100 166 Z" fill="#FDE047" {O(3)}/>
{shine(72, 112, 6, 14, 15, .45)}''')
# 14 Calendrier coché
B['regulier'] = wrap(f'''
<rect x="40" y="52" width="120" height="110" rx="14" fill="#F8FAFC" {O(5)}/>
<path d="M40 66 a14 14 0 0 1 14 -14 H146 a14 14 0 0 1 14 14 V86 H40 Z" fill="url(#red)" {O(5)}/>
<rect x="64" y="38" width="10" height="26" rx="5" fill="#94A3B8" {O(4)}/><rect x="126" y="38" width="10" height="26" rx="5" fill="#94A3B8" {O(4)}/>
<g fill="#CBD5E1"><rect x="56" y="98" width="16" height="12" rx="3"/><rect x="80" y="98" width="16" height="12" rx="3"/><rect x="56" y="120" width="16" height="12" rx="3"/><rect x="56" y="140" width="16" height="12" rx="3"/></g>
<circle cx="126" cy="130" r="26" fill="url(#green)" {O(5)}/>
<path d="M113 130 L122 140 L140 120" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>''')
# 15 Bouclier coché
B['fiable'] = wrap(f'''
<path d="M100 30 L156 50 V100 C156 136 130 160 100 172 C70 160 44 136 44 100 V50 Z" fill="url(#blue)" {O(5)}/>
<path d="M100 44 L142 59 V100 C142 128 122 146 100 156 Z" fill="#fff" opacity=".18"/>
<path d="M74 102 L94 122 L130 84" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M74 102 L94 122 L130 84" fill="none" stroke="#22C55E" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
{shine(68, 62, 12, 6)}''')
# 16 Chouette
B['oeil_lynx'] = wrap(f'''
<path d="M54 52 L70 74 L48 80 Z" fill="#92400E" {O(4)}/><path d="M146 52 L130 74 L152 80 Z" fill="#92400E" {O(4)}/>
<ellipse cx="100" cy="112" rx="56" ry="60" fill="url(#brown)" {O(5)}/>
<ellipse cx="100" cy="134" rx="30" ry="30" fill="#FDE68A"/>
<path d="M86 128 q4 4 8 0 M104 128 q4 4 8 0 M92 142 q4 4 8 0 M110 142 q4 4 8 0" fill="none" stroke="#D97706" stroke-width="2.5"/>
<circle cx="76" cy="96" r="22" fill="#fff" {O(5)}/><circle cx="124" cy="96" r="22" fill="#fff" {O(5)}/>
<circle cx="78" cy="98" r="11" fill="#F5B82E" {O(2)}/><circle cx="122" cy="98" r="11" fill="#F5B82E" {O(2)}/>
<circle cx="78" cy="98" r="6" fill="{K}"/><circle cx="122" cy="98" r="6" fill="{K}"/>
<circle cx="81" cy="94" r="2.5" fill="#fff"/><circle cx="125" cy="94" r="2.5" fill="#fff"/>
<path d="M92 112 L108 112 L100 124 Z" fill="#F97316" {O(3)}/>''')
B.pop('ref1', None); B.pop('v10', None)  # ref1 = poignée de main Fluent Emoji (MIT), voir icons/badges/licences/
for k, v in B.items():
    open(f'/home/claude/yadupeuple/icons/badges/{k}.svg', 'w').write(v)
print(len(B))

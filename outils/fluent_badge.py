"""Place un dessin Fluent Emoji (MIT) dans le médaillon des badges, avec le contour foncé."""
import re, sys
src, dst = sys.argv[1], sys.argv[2]
inner = open(src).read()
inner = re.sub(r'^<svg[^>]*>', '', inner).rsplit('</svg>', 1)[0]
open(dst, 'w').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">'
  '<defs><radialGradient id="bg" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#E6FFFB"/><stop offset=".65" stop-color="#B9F0E8"/><stop offset="1" stop-color="#8EDFD4"/></radialGradient>'
  '<filter id="ol" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="0.55" result="d"/><feFlood flood-color="#1F2937"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
  '<circle cx="100" cy="100" r="94" fill="url(#bg)"/>'
  '<path d="M30 70 A80 80 0 0 1 120 22" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".6"/>'
  f'<g transform="translate(30 30) scale(4.375)" filter="url(#ol)">{inner}</g></svg>\n')

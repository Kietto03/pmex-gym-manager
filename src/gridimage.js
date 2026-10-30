/* ═══════════════════════════════════════════════════════════════
   A grid build as a picture to share: pair, build name, move level, energy and every tile (picked ones lit, the rest slate, the
   level-locked ones dark, Arc tiles gold), like the game's own grid. This module only writes the SVG text (colours are written out, no
   CSS), so it runs anywhere; the page turns the SVG into a PNG.
   ═══════════════════════════════════════════════════════════════ */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FONT = "'Nunito','Segoe UI',system-ui,-apple-system,sans-serif", MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
const rgb = h => { const n = parseInt(String(h).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// `a` with `p` (0–1) of `b` mixed in, like CSS color-mix
export const mix = (a, b, p) => { const x = rgb(a), y = rgb(b); return `#${x.map((v, i) => Math.round(v * (1 - p) + y[i] * p).toString(16).padStart(2, '0')).join('')}`; };
const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i); return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');

export const IMG = { bg: '#161a24', card: '#1e2330', text: '#f1f3f8', muted: '#9aa2b8', slate: '#3a4054', slate2: '#464d63', deep: '#14161d', deep2: '#1a1d26', ink: '#e6e9f2', size: 38 };

/* m: { pair, type, typeColor, name, purpose, owner, moveLevel, energy, cap, orbs, tiles:[{ x, y, on, wait, lv, color, lines:[…] }], glyphs:{ kind: svgFragment },
        palette:{ kind:{ c, ink } }, legend:[{ kind, label, on, all }], portrait: dataUri|'' , date, footer } */
export function gridSvg(m, o = {}) {
  const R = IMG, S = R.size, pad = 36, scale = o.scale || 1;
  const xs = m.tiles.map(t => t.x), ys = m.tiles.map(t => t.y);
  const minX = Math.min(0, ...xs) - S - 4, maxX = Math.max(0, ...xs) + S + 4, minY = Math.min(0, ...ys) - S - 4, maxY = Math.max(0, ...ys) + S + 4;
  const bw = (maxX - minX) * scale, bh = (maxY - minY) * scale, W = Math.max(Math.round(bw + pad * 2), 900), headH = 150, legH = 44, footH = 46;
  const H = Math.round(headH + legH + bh + footH + pad), ox = (W - bw) / 2 - minX * scale, oy = headH + legH - minY * scale;
  const pal = k => m.palette[k] || m.palette.blue;
  const glow = t => (t.on ? `<polygon points="${hex(t.x * scale, t.y * scale, (S + 4) * scale)}" fill="${pal(t.color).c}" opacity=".30"/>` : '');
  const tile = t => {
    const p = pal(t.color), x = t.x * scale, y = t.y * scale, r = (S - 1) * scale, ri = (S - 5.5) * scale;
    let out = '', body, edge, txt, gl;
    if (t.on) {   // picked: the full colour, a pale rim and a glow, so it stands out from every other tile at a glance
      edge = mix(p.c, '#ffffff', .78); body = p.c; txt = p.ink; gl = p.ink;
    } else if (t.lv) { edge = '#101219'; body = '#161922'; txt = '#4d5367'; gl = mix(p.c, '#161922', .78); }
    else if (t.wait) { edge = p.c; body = '#262b3a'; txt = '#9aa2b8'; gl = p.c; }
    else { edge = '#303648'; body = '#232837'; txt = '#8189a0'; gl = mix(p.c, '#232837', .55); }   // not picked: dark, the kind only hinted
    const lines = t.lines || [], y0 = y - (lines.length - 1) * 5.3 * scale + 5 * scale;
    out += `<polygon points="${hex(x, y, r)}" fill="${edge}"${t.wait ? ` stroke="${p.c}" stroke-width="2" stroke-dasharray="5 4"` : ''}/><polygon points="${hex(x, y, ri)}" fill="${body}"/>`;
    out += `<g transform="translate(${x.toFixed(1)} ${(y - 19 * scale).toFixed(1)}) scale(${(1.05 * scale).toFixed(3)})" fill="${gl}" stroke="${gl}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" color="${gl}">${(m.glyphs[t.color] || '').replace(/currentColor/g, gl)}</g>`;
    out += `<text x="${x.toFixed(1)}" y="${y0.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${(10 * scale).toFixed(1)}" fill="${txt}">${lines.map((l, i) => `<tspan x="${x.toFixed(1)}" dy="${i ? (10.6 * scale).toFixed(1) : 0}">${esc(l)}</tspan>`).join('')}</text>`;
    if (t.lv && !t.on) out += `<text x="${x.toFixed(1)}" y="${(y + (S - 9) * scale).toFixed(1)}" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="${(8 * scale).toFixed(1)}" fill="#8d93a8">Lv ${t.lv}</text>`;
    return out;
  };
  const chip = (x, label, value, c) => `<g transform="translate(${x} 96)"><rect width="150" height="40" rx="10" fill="${R.card}" stroke="${c || '#2c3347'}" stroke-width="1.5"/><text x="12" y="16" font-family="${MONO}" font-size="10" fill="${R.muted}" letter-spacing="1">${esc(label.toUpperCase())}</text><text x="12" y="33" font-family="${FONT}" font-weight="800" font-size="17" fill="${R.text}">${esc(value)}</text></g>`;
  const legend = m.legend.map((l, i) => { const p = pal(l.kind), x = pad + i * 142; return `<g transform="translate(${x} ${headH + 8})"><polygon points="${hex(11, 14, 11)}" fill="${p.c}"/><text x="30" y="12" font-family="${FONT}" font-weight="700" font-size="12" fill="${R.text}">${esc(l.label)}</text><text x="30" y="27" font-family="${MONO}" font-size="11" fill="${R.muted}">${l.on} / ${l.all}</text></g>`; }).join('');
  const portrait = m.portrait ? `<clipPath id="pc"><rect x="${pad}" y="${pad - 6}" width="96" height="96" rx="16"/></clipPath><rect x="${pad}" y="${pad - 6}" width="96" height="96" rx="16" fill="${R.card}" stroke="${m.typeColor}" stroke-width="3"/><image href="${m.portrait}" x="${pad}" y="${pad - 6}" width="96" height="96" clip-path="url(#pc)" preserveAspectRatio="xMidYMid slice"/>` : `<rect x="${pad}" y="${pad - 6}" width="96" height="96" rx="16" fill="${R.card}" stroke="${m.typeColor}" stroke-width="3"/>`;
  const tx = pad + 114;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2230"/><stop offset="1" stop-color="#10131b"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bgg)"/><rect x="0" y="0" width="${W}" height="6" fill="${m.typeColor}"/>
${portrait}
<text x="${tx}" y="${pad + 18}" font-family="${FONT}" font-weight="800" font-size="30" fill="${R.text}">${esc(m.name)}</text>
<text x="${tx}" y="${pad + 44}" font-family="${FONT}" font-weight="700" font-size="16" fill="${R.muted}">${esc(m.pair)}${m.purpose ? ` · ${esc(m.purpose)}` : ''}</text>
${chip(W - pad - 150 * 3 - 20, 'Move level', `${m.moveLevel} / 5`)}${chip(W - pad - 150 * 2 - 10, 'Energy', `${m.energy} / ${m.cap}`, m.energy >= m.cap ? '#e0457d' : '')}${chip(W - pad - 150, 'Sync orbs', Number(m.orbs).toLocaleString('en-US'))}
${legend}
<g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)})">${m.tiles.map(glow).join('')}${m.tiles.map(tile).join('')}
<polygon points="${hex(0, 0, (S + 2) * scale)}" fill="${R.card}" stroke="${R.text}" stroke-width="3"/>${m.portrait ? `<clipPath id="cc"><polygon points="${hex(0, 0, (S - 5) * scale)}"/></clipPath><image href="${m.portrait}" x="${-(S - 5) * scale}" y="${-(S - 5) * scale}" width="${(S - 5) * 2 * scale}" height="${(S - 5) * 2 * scale}" clip-path="url(#cc)" preserveAspectRatio="xMidYMid slice"/>` : ''}
</g>
<text x="${pad}" y="${H - 20}" font-family="${MONO}" font-size="12" fill="${R.muted}">${esc(m.footer || '')}</text>
<text x="${W - pad}" y="${H - 20}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${R.muted}">${esc(m.owner ? `${m.owner} · ` : '')}${esc(m.date || '')}</text>
</svg>`;
  return { svg, width: W, height: H };
}

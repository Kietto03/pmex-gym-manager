/* ═══════════════════════════════════════════════════════════════
   Appearance: style (the whole look), colour mode and accent.
   Saved per device in localStorage; index.html applies them before the
   first paint so the page never flashes the wrong theme.
   ═══════════════════════════════════════════════════════════════ */
export const STYLES = [
  { id: 'switch', name: 'Switch', note: 'Rounded, bright, Joy-Con colours' },
  { id: 'ds', name: 'DS', note: 'Pixel titles, hard edges, handheld feel' },
  { id: 'gameboy', name: 'Game Boy', note: 'Four shades of green, pure retro' },
  { id: 'studio', name: 'Studio', note: 'Quiet paper and ink' },
];
export const ACCENTS = [
  { id: 'red', name: 'Neon red', color: '#ff3c28' },
  { id: 'blue', name: 'Neon blue', color: '#0ab9e6' },
  { id: 'yellow', name: 'Neon yellow', color: '#e6c700' },
  { id: 'green', name: 'Neon green', color: '#1edc00' },
  { id: 'purple', name: 'Purple', color: '#8f5cff' },
  { id: 'pink', name: 'Neon pink', color: '#ff3278' },
];
export const MODES = [['auto', 'Auto'], ['light', 'Light mode'], ['dark', 'Dark mode']];

const FONTS = {
  switch: 'family=Nunito:wght@500;600;700;800;900',
  ds: 'family=VT323&family=Nunito:wght@500;600;700;800;900',
  gameboy: 'family=VT323&family=Nunito:wght@500;600;700;800;900',
  studio: 'family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Geist:wght@400..700&family=Geist+Mono:wght@400..600',
};

const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export const getAppearance = () => ({ style: read('gym-style', 'switch'), mode: read('gym-theme', 'auto'), accent: read('gym-accent', 'red'), mascot: read('gym-mascot', 'kai'), mascotStyle: read('gym-mascot-style', 'auto') });

export function applyAppearance(patch = {}) {
  const a = { ...getAppearance(), ...patch };
  write('gym-style', a.style); write('gym-theme', a.mode); write('gym-accent', a.accent); write('gym-mascot', a.mascot); write('gym-mascot-style', a.mascotStyle);
  const root = document.documentElement;
  const dark = a.mode === 'dark' || (a.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.style = a.style;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.accent = a.accent;
  let link = document.getElementById('style-fonts');
  if (!link) {
    link = Object.assign(document.createElement('link'), { id: 'style-fonts', rel: 'stylesheet' });
    document.head.append(link);
  }
  const href = `https://fonts.googleapis.com/css2?${FONTS[a.style] || FONTS.switch}&display=swap`;
  if (link.href !== href) link.href = href;
  return a;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getAppearance().mode === 'auto') applyAppearance(); });

/* ═══════════════════════════════════════════════════════════════
   Appearance: style (the whole look), colour mode and accent.
   Saved per device in localStorage; index.html applies them before the
   first paint so the page never flashes the wrong theme.
   ═══════════════════════════════════════════════════════════════ */
export const STYLES = [
  { id: 'switch', name: 'Switch', note: 'Rounded, bright, Joy-Con colours' },
  { id: 'ds', name: 'DS', note: 'Glossy touch-screen keys, bright and tactile' },
  { id: 'gameboy', name: 'Game Boy', note: 'Four shades of an LCD, in the colour you pick' },
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
// The Game Boy's screen colour: each is the four shades of an LCD (styles.css, [data-gb])
export const GB_SCREENS = [
  { id: 'green', name: 'Classic green', color: '#88c070' }, { id: 'gray', name: 'Pocket grey', color: '#a8a8a8' }, { id: 'red', name: 'Berry', color: '#e07a86' },
  { id: 'blue', name: 'Ice', color: '#86aee6' }, { id: 'yellow', name: 'Amber', color: '#e8b030' }, { id: 'purple', name: 'Grape', color: '#a98ee6' }, { id: 'pink', name: 'Candy', color: '#f08cbc' },
];
export const MODES = [['auto', 'Auto'], ['light', 'Light mode'], ['dark', 'Dark mode']];

const FONTS = {
  switch: 'family=Nunito:wght@500;600;700;800;900',
  ds: 'family=M+PLUS+Rounded+1c:wght@500;700;800&family=Nunito:wght@500;600;700;800;900',
  gameboy: 'family=Pixelify+Sans:wght@400..700&family=VT323',
  studio: 'family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Geist:wght@400..700&family=Geist+Mono:wght@400..600',
};

const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export const getAppearance = () => ({ style: read('gym-style', 'switch'), mode: read('gym-theme', 'auto'), accent: read('gym-accent', 'red'), gb: read('gym-gb', 'green'), mascot: read('gym-mascot', 'kai'), mascotStyle: read('gym-mascot-style', 'auto') });

export function applyAppearance(patch = {}) {
  const a = { ...getAppearance(), ...patch };
  write('gym-style', a.style); write('gym-theme', a.mode); write('gym-accent', a.accent); write('gym-gb', a.gb); write('gym-mascot', a.mascot); write('gym-mascot-style', a.mascotStyle);
  const root = document.documentElement;
  const dark = a.mode === 'dark' || (a.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.style = a.style;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.accent = a.accent;
  root.dataset.gb = a.gb;
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

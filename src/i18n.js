/* ═══════════════════════════════════════════════════════════════
   Language. English is the default and doubles as the lookup key, so a
   missing translation just shows the English text. Vietnamese, Spanish and
   Japanese live in ./lang/vi.js, es.js and ja.js. `{name}` placeholders are
   filled from the params object.
   ═══════════════════════════════════════════════════════════════ */
import vi from './lang/vi.js';
import es from './lang/es.js';
import ja from './lang/ja.js';

const DICTS = { vi, es, ja };
export const LANGS = [['en', 'English'], ['vi', 'Tiếng Việt'], ['es', 'Español'], ['ja', '日本語']];
const LOCALES = { en: 'en-GB', vi: 'vi-VN', es: 'es-ES', ja: 'ja-JP' };

let lang = 'en';
try { lang = localStorage.getItem('gym-lang') || 'en'; } catch { /* private mode */ }
if (!(lang in DICTS) && lang !== 'en') lang = 'en';
document.documentElement.lang = lang;

export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  document.documentElement.lang = l;
  try { localStorage.setItem('gym-lang', l); } catch { /* private mode */ }
}

export function t(text, params = {}) {
  const s = (lang !== 'en' && DICTS[lang]?.[text]) || text;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

export const locale = () => LOCALES[lang] || 'en-GB';

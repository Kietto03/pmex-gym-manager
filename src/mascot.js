/* ═══════════════════════════════════════════════════════════════
   Companion mascot — a vanilla port of page-mascot's <Mascot />
   (github.com/nilbuild/page-mascot, MIT). Two 3×3 sheets per character:
   nine head directions and nine reactions, swapped with background-position.
   · it looks around on its own and blinks now and then (it does not chase the pointer)
   · a click blinks, then shows a heart / sparkles / a grin; four quick clicks → dizzy
   · it dozes off when the page sits still, and says something useful in a speech card
   Sheets: assets/mascots/<file>[-pixel]-{directions,reactions}.webp, drawn with the
   page-mascot skill (original trainer designs, modern and pixel styles).
   ═══════════════════════════════════════════════════════════════ */
export const MASCOTS = [
  { id: 'kai', file: 'ace', name: 'Kai', cry: ['Let’s go!', 'Ready to battle!', 'Heh, nice one!'] },
  { id: 'momo', file: 'ranger', name: 'Momo', cry: ['Hehe~', 'Adventure time!', 'Found you!'] },
  { id: 'sage', file: 'scholar', name: 'Sage', cry: ['Hmm, interesting.', 'Let me check the data…', 'Noted!'] },
  { id: 'aria', file: 'champion', name: 'Aria', cry: ['Stay sharp.', 'Victory awaits.', 'Good form.'] },
];
export const MASCOT_STYLES = [['auto', 'Auto'], ['modern', 'Modern'], ['pixel', 'Pixel']];
// Auto: pixel art in the DS and Game Boy themes, the modern drawing everywhere else
export const resolveStyle = s => (s === 'auto' ? (['ds', 'gameboy'].includes(document.documentElement.dataset.style) ? 'pixel' : 'modern') : s);
const fileOf = id => (MASCOTS.find(m => m.id === id) || MASCOTS[0]).file;
const DIRECTIONS = ['up-left', 'up', 'up-right', 'left', 'center', 'right', 'down-left', 'down', 'down-right'];
const REACTIONS = ['blink', 'heart', 'sparkle', 'surprised', 'starstruck', 'bashful', 'sleepy', 'dizzy', 'delighted'];
// Idle glances: mostly straight ahead, sometimes a look to the side
const GLANCES = ['center', 'center', 'center', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right', 'up', 'down'];
const PAYOFFS = ['heart', 'sparkle', 'delighted', 'starstruck', 'bashful'];
const BOOP_PAYOFF = 120, BOOP_END = 700, DIZZY_AFTER = 4, DIZZY_WINDOW = 1600, DIZZY_END = 1300;
const DOZE_AFTER = 45000;
const SQUASH = [
  { transform: 'scale(1, 1)', easing: 'ease-in' },
  { transform: 'scale(1.10, 0.86)', offset: 0.18, easing: 'ease-out' },
  { transform: 'scale(0.95, 1.08)', offset: 0.45, easing: 'ease-in-out' },
  { transform: 'scale(1.03, 0.97)', offset: 0.72, easing: 'ease-in-out' },
  { transform: 'scale(1, 1)' },
];
const pos = i => `${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%`;
const sheet = (id, style, kind) => `assets/mascots/${fileOf(id)}${resolveStyle(style) === 'pixel' ? '-pixel' : ''}-${kind}.webp`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Static head (the "center" cell) — used as the brand logo and in Settings
export const mascotHead = (id, style = 'auto', cls = '') =>
  `<span class="m-head ${cls} ${resolveStyle(style)}" style="background-image:url(${sheet(id, style, 'directions')});background-position:${pos(4)}" aria-hidden="true"></span>`;

export function mountCompanion(root, { getTips, t = s => s }) {
  let id = null, direction = 'center', reaction = null, timers = [], boops = { count: 0, at: 0 };
  let lastMove = Date.now(), tipIndex = 0, sayTimer, typeTimer;

  root.innerHTML = `
    <div class="m-say" role="status" aria-live="polite"><b class="m-name"></b><p></p><button type="button" class="m-close" aria-label="${t('Hide')}">×</button></div>
    <button type="button" class="m-btn"><span class="m-squash"><span class="m-layer m-dir"></span><span class="m-layer m-react"></span></span></button>`;
  const btn = root.querySelector('.m-btn'), squash = root.querySelector('.m-squash');
  const dir = root.querySelector('.m-dir'), react = root.querySelector('.m-react');
  const card = root.querySelector('.m-say'), text = card.querySelector('p'), name = card.querySelector('.m-name');

  const paint = () => {
    dir.style.backgroundPosition = pos(DIRECTIONS.indexOf(direction));
    react.style.backgroundPosition = pos(REACTIONS.indexOf(reaction || 'blink'));
    dir.style.opacity = reaction ? 0 : 1;
    react.style.opacity = reaction ? 1 : 0;
  };
  const setReaction = r => { reaction = r; paint(); };
  const later = (ms, next) => timers.push(setTimeout(() => setReaction(next), ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // ─── Idle life: glance around, blink, wake up when the user comes back ───
  const idle = () => {
    if (id && !reaction) {
      const next = direction === 'center' ? GLANCES[Math.floor(Math.random() * GLANCES.length)] : 'center';
      direction = next;
      paint();
    }
    timers.idle = setTimeout(idle, direction === 'center' ? 2500 + Math.random() * 4500 : 900 + Math.random() * 900);
  };
  const blink = () => {
    if (id && !reaction && !reduced()) { reaction = 'blink'; paint(); setTimeout(() => { if (reaction === 'blink') { reaction = null; paint(); } }, 140); }
    setTimeout(blink, 2800 + Math.random() * 3800);
  };
  setTimeout(idle, 2000);
  setTimeout(blink, 1500);
  const wake = () => {
    lastMove = Date.now();
    if (reaction === 'sleepy') { clearTimers(); setReaction('surprised'); later(600, null); }
  };
  addEventListener('pointerdown', wake, { passive: true });
  addEventListener('keydown', wake);
  addEventListener('pointermove', () => { if (Date.now() - lastMove > 1000) wake(); }, { passive: true });
  // Doze off when nothing happens for a while
  setInterval(() => { if (id && !reaction && Date.now() - lastMove > DOZE_AFTER) setReaction('sleepy'); }, 5000);

  // ─── Speech card ───
  const say = (msg, ms = 5200) => {
    const m = MASCOTS.find(x => x.id === id);
    name.textContent = m?.name || '';
    clearTimeout(sayTimer); clearInterval(typeTimer);
    card.classList.add('show');
    if (reduced()) text.textContent = msg;
    else {
      let i = 0;
      text.textContent = '';
      typeTimer = setInterval(() => { text.textContent = msg.slice(0, ++i); if (i >= msg.length) clearInterval(typeTimer); }, 18);
    }
    sayTimer = setTimeout(() => card.classList.remove('show'), ms);
  };
  card.querySelector('.m-close').addEventListener('click', () => { clearTimeout(sayTimer); card.classList.remove('show'); });

  // ─── Boop ───
  btn.addEventListener('click', () => {
    clearTimers();
    lastMove = Date.now();
    const now = Date.now();
    boops.count = now - boops.at < DIZZY_WINDOW ? boops.count + 1 : 1;
    boops.at = now;
    const m = MASCOTS.find(x => x.id === id);
    if (boops.count >= DIZZY_AFTER) {
      boops.count = 0;
      setReaction('dizzy');
      later(DIZZY_END, null);
      say(`${t(m.cry[0])} @_@`, 2200);
    } else {
      setReaction('blink');
      later(BOOP_PAYOFF, PAYOFFS[(boops.count - 1 + tipIndex) % PAYOFFS.length]);
      later(BOOP_END, null);
      const tips = getTips() || [];
      if (boops.count === 1) say(tips.length && tipIndex % 4 !== 3 ? tips[tipIndex++ % tips.length] : (tipIndex++, t(m.cry[Math.floor(Math.random() * m.cry.length)])));
    }
    if (!reduced()) squash.animate(SQUASH, { duration: 420, easing: 'linear' });
  });

  return {
    set(next, style = 'auto') {
      id = MASCOTS.some(m => m.id === next) ? next : null;
      root.hidden = !id;
      if (!id) return;
      const m = MASCOTS.find(x => x.id === id);
      btn.setAttribute('aria-label', t('Boop {n}', { n: m.name }));
      root.classList.toggle('pixel', resolveStyle(style) === 'pixel');
      dir.style.backgroundImage = `url(${sheet(id, style, 'directions')})`;
      react.style.backgroundImage = `url(${sheet(id, style, 'reactions')})`;   // loaded up front, never on the first click
      paint();
    },
    greet(msg) { if (id) { setReaction('blink'); later(BOOP_PAYOFF, 'delighted'); later(BOOP_END + 300, null); say(msg, 6500); } },
  };
}

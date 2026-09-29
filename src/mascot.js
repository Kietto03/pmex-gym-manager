/* ═══════════════════════════════════════════════════════════════
   Pixel Pikachu mascot for the header.
   · blinks on its own and its eyes follow the pointer
   · ears wiggle on hover
   · click: hop + cheek sparks + a speech bubble; five quick clicks → Thunderbolt
   Drawn on an 18×19 grid: k outline · y yellow · w eye shine · r cheek
   ═══════════════════════════════════════════════════════════════ */
const ART = `
k................k
kk..............kk
kkk............kkk
.kkk..........kkk.
.kyyk........kyyk.
..kyyk......kyyk..
..kyyyk....kyyyk..
...kyyykkkkyyyk...
..kyyyyyyyyyyyyk..
.kyywkyyyyyywkyyk.
.kyykkyyyyyykkyyk.
kyrryyyyyyyyyyrryk
kyrryyykyykyyyrryk
.kyyyyyykkyyyyyyk.
..kyyyyyyyyyyyyk..
..kyykyyyyyykyyk..
..kyyyyyyyyyyyyk..
...kyyk....kyyk...
...kkkk....kkkk...`;

const FILL = { k: 'var(--pk-line)', y: 'var(--pk-body)', w: '#fff', r: 'var(--pk-cheek)' };
const LINES = ['Pika!', 'Pika pika!', 'Pikachu!', 'Pika pi?', 'Chaa~', 'Pi-ka!'];

function svg() {
  const rows = ART.trim().split('\n');
  const parts = { earL: '', earR: '', eyes: '', cheeks: '', body: '' };
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '.') return;
    const rect = `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${FILL[c]}"/>`;
    if (y <= 6) parts[x < 9 ? 'earL' : 'earR'] += rect;
    else if ((y === 9 || y === 10) && [4, 5, 12, 13].includes(x)) parts.eyes += rect;
    else if (c === 'r') parts.cheeks += rect;
    else parts.body += rect;
  }));
  return `<svg class="pk" viewBox="0 0 18 19" shape-rendering="crispEdges" aria-hidden="true">
    <g class="pk-ear pk-ear-l">${parts.earL}</g><g class="pk-ear pk-ear-r">${parts.earR}</g>
    <g class="pk-body">${parts.body}</g><g class="pk-cheeks">${parts.cheeks}</g><g class="pk-eyes">${parts.eyes}</g>
  </svg>`;
}

export function mountMascot(el) {
  el.innerHTML = `${svg()}<span class="pk-say" aria-live="polite"></span><span class="pk-zap" aria-hidden="true"></span>`;
  el.title = 'Pika!';
  const say = el.querySelector('.pk-say'), eyes = el.querySelector('.pk-eyes');
  let clicks = [], sayTimer;

  // Eyes follow the pointer (at most one pixel each way)
  addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 120));
    const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 120));
    eyes.style.transform = `translate(${dx.toFixed(2)}px, ${(dy * .6).toFixed(2)}px)`;
  }, { passive: true });

  // Blink every few seconds, sometimes twice
  const blink = () => {
    el.classList.add('blink');
    setTimeout(() => el.classList.remove('blink'), 140);
    setTimeout(blink, 2500 + Math.random() * 3500);
  };
  setTimeout(blink, 1800);

  el.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    clicks = clicks.filter(t => now - t < 1600).concat(now);
    const bolt = clicks.length >= 5;
    if (bolt) clicks = [];
    el.classList.remove('hop', 'zap', 'bolt');
    void el.offsetWidth;   // restart the animations
    el.classList.add('hop', 'zap');
    if (bolt) { el.classList.add('bolt'); document.documentElement.classList.add('thunder'); setTimeout(() => document.documentElement.classList.remove('thunder'), 600); }
    say.textContent = bolt ? 'Thunderbolt!' : LINES[Math.floor(Math.random() * LINES.length)];
    el.classList.add('talk');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => el.classList.remove('talk'), 1300);
  });
}

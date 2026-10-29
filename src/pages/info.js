// Page module (split out of main.js). Registers its own listeners when imported.
import { $, esc, fmtN, fmtK, fmtDT, fmtD, img, tc, act, api, S, isStaff, season, leaderImg, state, hooks } from '../core.js';
import { ico } from '../icons.js';
import { t } from '../i18n.js';
import { circuitAt, roundShort } from '../rules.js';
import { typeIcon, GYMS, GYMS_META, seasonFromGym, leaderRule, leaderFocus } from '../catalog.js';

// ═══════════════════════════════════════════════════════════════
//  BATTLE INFO: everything the datamine says about the Gym Battle
// ═══════════════════════════════════════════════════════════════
let infoStage = 0, infoTab = 'bosses';
const plain = x => String(x || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();
export function renderInfo() {
  const s = season();
  if (!s) return hooks.seasonBar() + hooks.noSeason();
  const g = GYMS().find(x => x.name === (s.gym_key || s.name)) || GYMS().find(x => s.name.startsWith(x.name));
  if (!g) return `${hooks.seasonBar()}<div class="card pad"><h2 class="title">${t('Battle info')}</h2><p class="muted">${t('The datamine has no details for this Gym Battle.')}</p></div>`;
  const tabs = [['bosses', 'Opponents'], ['next', 'Next rounds'], ['schedule', 'Schedule and tickets'], ['rewards', 'Rewards']];
  const st = g.stages[Math.min(infoStage, g.stages.length - 1)], c = g.circuits[Math.min(infoStage, g.circuits.length - 1)];
  const maxHp = Math.max(1, ...g.stages.flatMap(x => x.leaders.flatMap(l => (l.units || []).map(u => u.hp || 0))));
  const stat = (k, v) => `<span class="us"><small>${k}</small><b>${fmtN(v)}</b></span>`;
  const unit = u => `<div class="unit"><div class="unit-h"><b>${t(u.pos)}</b> ${u.weakness ? `<span class="weak">${t('Weak to')} ${img(typeIcon(u.weakness), 'ti', u.weakness)}</span>` : ''}</div>
    <div class="hpbar" title="${fmtN(u.hp)} HP"><i style="width:${Math.max(1.5, u.hp / maxHp * 100)}%"></i></div>
    <div class="ustats">${stat('HP', u.hp)}${stat('ATK', u.atk)}${stat('DEF', u.def)}${stat('SP.ATK', u.spa)}${stat('SP.DEF', u.spd)}${stat('SPE', u.spe)}</div>
    ${(u.focus || []).length ? `<div class="chips-l"><small>${t('Focus')}</small>${u.focus.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
    ${u.reduction ? `<div class="chips-l"><small>${t('Condition')}</small><span class="chip">${esc(u.reduction)}</span>${(u.reductionMods || []).map(f => `<span class="chip dim">${esc(f)}</span>`).join('')}</div>` : ''}
    ${(u.passives || []).length ? `<div class="chips-l"><small>${t('Passives')}</small>${u.passives.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}</div>`;

  // HP of the centre boss through the circuits (the first leader of each circuit; every leader scales the same way)
  const hpSeries = g.stages.map(x => Math.max(0, ...x.leaders.map(l => l.units?.[0]?.hp || 0)));
  const hpTop = Math.max(1, ...hpSeries);
  const hpChart = `<div class="card pad"><h2 class="title">${t('Boss HP by circuit')} <small>${t('click a bar to open that circuit')}</small></h2>
    <div class="bars">${hpSeries.map((v, i) => `<button class="bar ${/^C\d/.test(roundShort(g.stages[i].name)) ? 'reg' : ''} ${i === infoStage ? 'on' : ''}" data-istage="${i}" aria-pressed="${i === infoStage}" title="${esc(g.stages[i].name)}: ${fmtN(v)} HP"><span class="bv">${fmtK(v)}</span><i style="height:${Math.max(2, v / hpTop * 100)}%"></i><span class="bl">${esc(roundShort(g.stages[i].name))}</span></button>`).join('')}</div></div>`;
  const body = infoTab === 'next' ? nextRounds(s, g) : infoTab === 'schedule' ? `
    <div class="cols"><section><h2>${t('Schedule')}</h2><div class="card list">${g.phases.map(p => `<div class="run"><div><b>${esc(t(p.name))}</b><small class="muted">${fmtDT(p.start + 'Z')} → ${fmtDT(p.end + 'Z')}</small></div></div>`).join('')}</div></section>
    <section><h2>${t('Tickets and time')}</h2><div class="card scroll"><table class="table"><thead><tr><th class="num">${t('Tickets')}</th><th>${t('Time limit')}</th><th class="num">${t('Buff')}</th></tr></thead>
      <tbody>${g.tickets.map(x => `<tr><td class="num">×${x.tickets}</td><td>${esc(x.time)}</td><td class="num">${x.buff ? '+' + x.buff : '—'}</td></tr>`).join('')}</tbody></table></div></section></div>
    <h2 class="section">${t('Circuits')}</h2><div class="card scroll"><table class="table"><thead><tr><th>${t('Circuit')}</th><th>${t('Kind')}</th><th>${t('Ball')}</th><th class="num">${t('Points per leader')}</th></tr></thead>
      <tbody>${g.circuits.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.kind)}</td><td>${esc(x.ball)}</td><td class="num">${fmtN(x.pts)}</td></tr>`).join('')}</tbody></table></div>
    ${g.rotateNote ? `<p class="muted">${esc(g.rotateNote)}</p>` : ''}`
  : infoTab === 'rewards' ? `
    <div class="cols"><section><h2>${t('Score rewards')}</h2><div class="card scroll"><table class="table"><tbody>${(g.score || []).map(x => `<tr><td class="num"><b>${fmtN(x.pts)}</b></td><td>${x.tag ? `<span class="badge gold">${esc(plain(x.tag))}</span> ` : ''}${x.items.map(i => esc(plain(i))).join(', ')}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h2>${t('Ranking rewards')}</h2><div class="card scroll"><table class="table"><tbody>${(g.ranking || []).map(x => `<tr><td><b>${esc(plain(x.label))}</b></td><td>${x.items.map(i => esc(plain(i))).join(', ')}</td></tr>`).join('')}</tbody></table></div></section></div>`
  : `<div class="seg wrap">${g.stages.map((x, i) => `<button class="${i === infoStage ? 'on' : ''}" data-istage="${i}">${esc(roundShort(x.name))}</button>`).join('')}</div>
    <p class="muted">${esc(c.name)} · ${esc(c.kind)} · ${esc(c.ball)} · ${t('{n} points per leader', { n: fmtN(c.pts) })}</p>
    ${hpChart}
    <h2 class="section">${t('Every opponent')}</h2>
    <div class="info-grid">${st.leaders.map(l => `<article class="card pad info-l" style="--tc:${tc(l.type)}">
      <header>${leaderImg(s, l.name)}<div><h3>${esc(l.name)}</h3><small class="muted">${img(typeIcon(l.type), 'ti', l.type)} ${esc(l.title || '')}</small></div></header>
      <div class="rules"><small>${t('Rules')}</small>${l.rules?.length ? l.rules.map((r, i) => `<p><b>${t('Rules')} ${i + 1}</b> ${esc(r)}</p>`).join('') : `<p>${esc(l.rule || l.theme || t('No rules'))}</p>`}
        ${l.rule && l.theme && l.theme !== l.rule && !l.rules?.length ? `<p class="muted">${esc(l.theme)}</p>` : ''}</div>
      ${(l.units || []).map(unit).join('')}</article>`).join('')}</div>`;
  return `${hooks.seasonBar()}
  <div class="toolbar"><h1>${t('Battle info')} <small class="muted">${esc(g.name)}${g.version ? ` · v${esc(g.version)}` : ''}</small></h1>
    <div class="seg">${tabs.map(([k, l]) => `<button class="${infoTab === k ? 'on' : ''}" data-itab="${k}">${t(l)}</button>`).join('')}</div></div>${body}`;
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-istage]'), b = e.target.closest('[data-itab]');
  if (a) { infoStage = +a.dataset.istage; hooks.route(); } else if (b) { infoTab = b.dataset.itab; hooks.route(); }
});

// ── Next rounds: what the open round and the ones after it will bring, and what the datamine knows about coming Gym Battles ──
const leaderCard = (s, name, n, stage) => {
  const l = s.leaders.find(x => x.name === name) || { name }, rule = leaderRule(s, name, n), focus = leaderFocus(s, name, n);
  const dl = stage?.leaders.find(x => x.name === name), u = dl?.units?.[0];
  return `<div class="nr-l" style="--tc:${tc(l.type)}">${leaderImg(s, name)}<div><b>${esc(name)}</b> ${(l.weakness || []).map(w => img(typeIcon(w), 'ti', w)).join('')}
    <small class="muted">${esc(rule || t('No rules'))}</small>
    ${focus.length ? `<div class="chips-l">${focus.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
    ${u ? `<small class="muted">${t('Boss HP')} ${fmtN(u.hp)}${(u.passives || []).length ? ` · ${esc(u.passives.join(', '))}` : ''}</small>` : ''}</div></div>`;
};
// What changed between the stored snapshot of a season and the latest datamine
function snapshotDiff(s, g) {
  const snap = s.gym_data?.stages || [], out = [];
  if (snap.length && snap.length !== g.stages.length) out.push(t('{a} circuits stored, {b} in the datamine', { a: snap.length, b: g.stages.length }));
  g.stages.forEach((st, i) => st.leaders.forEach(l => {
    const old = snap[i]?.leaders.find(x => x.name === l.name);
    if (!old) { if (snap.length) out.push(`${st.name} · ${l.name}: ${t('new')}`); return; }
    const a = JSON.stringify([old.theme, old.rules, old.focus]), b = JSON.stringify([l.theme, l.rules, l.units?.[0]?.focus || []]);
    if (a !== b) out.push(`${st.name} · ${l.name}`);
  }));
  return out;
}
function nextRounds(s, g) {
  const st = state(), meta = GYMS_META(), now = Date.now();
  const over = st.phase === 'ended' || st.finished, start = st.active || 1;
  const rounds = over ? [] : [start, start + 1, start + 2].filter(n => circuitAt(s, n));
  const known = new Set(S.seasons.map(x => x.gym_key).filter(Boolean));
  const coming = GYMS().filter(x => !known.has(x.name) && Date.parse((x.phases.find(p => p.name === 'Battle') || {}).start + 'Z') > now);
  const diff = g ? snapshotDiff(s, g) : [];
  const stageOf = n => g?.stages[Math.min(n, g.stages.length) - 1];
  const src = `<div class="card pad nr-src"><b>${t('Where this comes from')}</b>
    <p class="muted">${t('Season data stored on {d}.', { d: fmtD(s.created_at) })} ${meta.builtAt ? t('Datamine: game version {v}, built {d}.', { v: (meta.versions || []).join(', ') || '—', d: fmtD(meta.builtAt) }) : t('The datamine could not be loaded: showing the stored data only.')}</p>
    ${diff.length ? `<p class="notice">${ico('note')} ${t('The datamine differs from the stored data in {n} places.', { n: diff.length })}</p><ul class="muted">${diff.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}${diff.length > 8 ? `<li>…</li>` : ''}</ul>
      ${isStaff() ? `<button class="btn" data-apply-datamine>${t('Update the stored data from the datamine')}</button>` : `<small class="muted">${t('A mod or the admin can apply it.')}</small>`}`
      : g ? `<p class="muted">${ico('check')} ${t('The stored data matches the datamine.')}</p>` : ''}</div>`;
  return `${src}
  <h2 class="section">${esc(s.name)} <small>${over ? t('No rounds left in this Gym Battle.') : t('the open round and the next two')}</small></h2>
  ${rounds.map(n => { const c = circuitAt(s, n);
    return `<section class="card pad nr"><div class="row"><h3>${esc(c.label)}${n === st.active ? ` <span class="badge good">${t('open')}</span>` : ''}</h3><span class="spacer"></span><small class="muted">${t('{n} points per leader', { n: fmtN(c.pts) })}</small></div>
      <div class="nr-grid">${s.leaders.map(l => leaderCard(s, l.name, n, stageOf(n))).join('')}</div></section>`; }).join('')}
  <h2 class="section">${t('Coming Gym Battles')} <small>${t('from the datamine, not confirmed by the game yet')}</small></h2>
  ${coming.map(x => { const b = x.phases.find(p => p.name === 'Battle') || {}, first = x.stages[0], sx = { leaders: first.leaders.map(l => ({ name: l.name, type: l.type, weakness: [...new Set((l.units || []).map(u => u.weakness).filter(Boolean))] })), gym_data: seasonFromGym(x).gym_data };
    return `<section class="card pad nr"><div class="row"><h3>${esc(x.name)}</h3><span class="badge gold">${t('Datamine, unconfirmed')}</span><span class="spacer"></span><small class="muted">${fmtDT(b.start + 'Z')} → ${fmtDT(b.end + 'Z')}</small></div>
      <small class="muted">${esc(first.name)}</small><div class="nr-grid">${sx.leaders.map(l => leaderCard(sx, l.name, 1, first)).join('')}</div></section>`; }).join('')
    || `<p class="muted">${t('The datamine has no Gym Battle after this one yet.')}</p>`}`;
}
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-apply-datamine]')) return;
  const s = season(), g = GYMS().find(x => x.name === (s.gym_key || s.name));
  if (!g || !confirm(t('Replace the stored rules and boss focus of {s} with the datamine? Scores and rounds are not touched.', { s: s.name }))) return;
  if (await act(() => api.updateSeason(s.id, { gym_data: seasonFromGym(g).gym_data }), t('Stored data updated.'))) { S.seasons = await api.seasons(); hooks.route(); }
});

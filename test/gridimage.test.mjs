import assert from 'node:assert/strict';
import { gridSvg, mix } from '../src/gridimage.js';

const palette = { blue: { c: '#779eff', ink: '#0f1f45' }, arc: { c: '#e6b422', ink: '#3a2600' } };
const m = { pair: 'Arc Suit Lance & Dragonite', type: 'Dragon', typeColor: '#6f35fc', name: 'Speed & <gauge>', purpose: 'GvG', owner: 'Lumina', moveLevel: 5, energy: 44, cap: 70, orbs: 1234,
  glyphs: { blue: '<path d="M0 0"/>', arc: '<path d="M1 1"/>' }, palette, portrait: '', date: '2026-10-30', footer: 'PMEX Gym Manager',
  legend: [{ kind: 'blue', label: 'Stat', on: 3, all: 9 }, { kind: 'arc', label: 'Arc Suit', on: 0, all: 3 }],
  tiles: [{ x: 0, y: -66, on: true, color: 'blue', lines: ['HP +10'] }, { x: 57, y: -33, on: false, color: 'blue', lines: ['Attack', '+5'] }, { x: 0, y: -132, on: false, lv: 4, color: 'arc', lines: ['Relentless'] }] };
const { svg, width, height } = gridSvg(m);
assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>') && width >= 760 && height > 300);
assert.ok(svg.includes('Speed &amp; &lt;gauge&gt;'), 'text is escaped');
assert.ok(svg.includes('44 / 70') && svg.includes('5 / 5'), 'energy and move level are written');
assert.ok(svg.includes('Lv 4'), 'a level-locked tile carries its level');
assert.ok(svg.includes('#779eff') && svg.includes('#e6b422'), 'picked and arc colours are written out');
assert.ok(!svg.includes('var(--') && !svg.includes('currentColor'), 'no CSS variables: the picture stands alone');
assert.equal(mix('#000000', '#ffffff', .5), '#808080');
assert.ok(gridSvg(m, { scale: 1.5 }).width >= width);
console.log('grid image: all passed');

// Run: node test/sync-clears.test.mjs — the D.C. and GvG clear sheets, on saved copies
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCsv } from '../tools/sync-gems.mjs';
import { parseDc, parseGvg } from '../tools/sync-clears.mjs';

const csv = f => parseCsv(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const dc = parseDc(csv('dc-all.csv'));
assert.equal(dc.length, 155); assert.equal(dc.filter(x => x.mode === '3v3').length, 101); assert.equal(dc.filter(x => x.mode === '3v1').length, 54);
assert.deepEqual(dc[0], { type: 'Bug', mode: '3v3', score: 33602712, units: [{ name: 'Red 1996', level: 5, ex: true, exr: true }, { name: 'Benga', level: 5, ex: true, exr: true }, { name: 'Alder (Arc)', level: 5, ex: true, exr: true }], video: 'https://www.youtube.com/shorts/R58kueZirRs' });
assert.ok(dc.every(x => x.units.length === 3 && x.score > 1e6), 'three pairs and a score on every D.C. row');
assert.ok(dc.filter(x => x.video).length >= 150, 'nearly every row has a video');
const el = parseGvg(csv('gvg-electric.csv'));
assert.equal(el.length, 4); assert.equal(el[0].season, 'SS3 Johto'); assert.equal(el[0].type, 'Electric'); assert.equal(el[0].tickets, 2); assert.equal(el[0].round, 'Extra 5'); assert.equal(el[0].score, 199585);
assert.equal(el[0].rules, 'SE, Only Special'); assert.deepEqual(el[0].units.map(u => u.name), ['Gloria (Anni)', 'Iono (SS)', 'Red 1996']); assert.match(el[0].video, /^https:\/\/youtu\.be\//);
const fire = parseGvg(csv('gvg-fire.csv'));
assert.equal(fire.length, 3); assert.equal(fire[0].round, 'Extra 12 +'); assert.equal(fire[0].tickets, 3);
assert.deepEqual(parseGvg([['Rock', 'Type']]), [], 'a tab without the GvG header yields nothing');
console.log('clear libraries: all passed');

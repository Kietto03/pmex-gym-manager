// Run: node test/acquisition.test.mjs — the order of acquisition groups for the roster
import assert from 'node:assert/strict';
import { acqRank, acqLabel, byAcquisition } from '../src/acquisition.js';

assert.equal(acqLabel('Arc Suit Fair Scout'), 'AF'); assert.equal(acqLabel('EX Master Fair Scout'), 'ExMF'); assert.equal(acqLabel('Master Fair Scout'), 'MF');
assert.equal(acqLabel('EX Fair Scout'), 'Ex Fair'); assert.equal(acqLabel('Poké Fair Scout'), 'PF'); assert.equal(acqLabel('Pokemon Fair Scout'), 'PF');
for (const x of ['Seasonal Scout', 'Variety Scout', 'Event Reward', 'Trainer Lodge Exchange', '', undefined]) assert.equal(acqLabel(x), 'Etc', String(x));
assert.ok(acqRank('EX Master Fair Scout') < acqRank('Master Fair Scout'), '"EX Master Fair" is not mistaken for "Master Fair"');
const list = [{ acquisition: 'Seasonal Scout', release: '2026-10-01' }, { acquisition: 'Poké Fair Scout', release: '2026-01-01' }, { acquisition: 'Arc Suit Fair Scout', release: '2025-01-01' },
  { acquisition: 'Arc Suit Fair Scout', release: '2026-05-01' }, { acquisition: 'EX Master Fair Scout', release: '2024-05-01' }, { acquisition: 'Master Fair Scout', release: '2026-09-01' }];
assert.deepEqual(list.sort(byAcquisition).map(x => `${acqLabel(x.acquisition)} ${x.release}`), ['AF 2026-05-01', 'AF 2025-01-01', 'ExMF 2024-05-01', 'MF 2026-09-01', 'PF 2026-01-01', 'Etc 2026-10-01']);
console.log('acquisition order: all passed');

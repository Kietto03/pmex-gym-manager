import assert from 'node:assert/strict';
import { formViews, mechOf, formText, allMoveNames } from '../src/forms.js';

const mv = (slot, name, extra = {}) => ({ slot, name, isSync: false, type: 'Fire', category: 'Physical', description: '', ...extra });
const base = { pokemon: 'Charizard', pokeSprite: 'assets/pokemon/charizard.png', stats: { 140: { HP: 1 } },
  moves: [mv(1, 'Ember'), mv(2, 'Flame Burst'), mv(3, 'Heat Wave'), mv(4, 'Dragon Claw')], syncMove: mv('Sync', 'Blast Burn', { isSync: true }),
  passives: [{ slot: 1, name: 'P1' }, { slot: 2, name: 'P2' }, { slot: 3, name: 'P3' }], superPassive: { name: 'Super' } };
const names = list => list.map(m => m.name);

// normal form: complete moveset, no tera extras when the pair has none
let v = formViews({ ...base, altSprites: [] });
assert.equal(v.length, 1);
assert.deepEqual(names(v[0].moves), ['Ember', 'Flame Burst', 'Heat Wave', 'Dragon Claw']);
assert.equal(v[0].sync.name, 'Blast Burn');
assert.equal(v[0].mech.key, 'base');

// a form that changes ONE move still shows the whole moveset, with the changed one marked and remembering what it replaces
const formPair = { ...base, altSprites: [{ kind: 'form', label: 'Pikachu · After it', sprite: 's.png', moves: [null, null, mv(3, 'Glorious Thunder'), null], stats: { 140: { HP: 2 } } }] };
v = formViews(formPair);
assert.equal(v.length, 2);
assert.deepEqual(names(v[1].moves), ['Ember', 'Flame Burst', 'Glorious Thunder', 'Dragon Claw']);
assert.equal(v[1].moves[2].changed, true);
assert.equal(v[1].moves[2].replaces, 'Heat Wave');
assert.equal(v[1].moves[0].changed, undefined);
assert.equal(v[1].sync.name, 'Blast Burn');            // untouched sync move carries over
assert.deepEqual(v[1].stats, { 140: { HP: 2 } });
assert.deepEqual(names(v[1].passives), ['P1', 'P2', 'P3']);

// a form that changes only a passive (no `moves` at all) is still a form, with the full moveset
v = formViews({ ...base, altSprites: [{ kind: 'mega', label: 'Mega Charizard', sprite: 'm.png', passives: [null, { slot: 2, name: 'Mega P2' }, null] }] });
assert.equal(v.length, 2);
assert.deepEqual(names(v[1].moves), ['Ember', 'Flame Burst', 'Heat Wave', 'Dragon Claw']);
assert.deepEqual(names(v[1].passives), ['P1', 'Mega P2', 'P3']);
assert.equal(v[1].passives[1].changed, true);
assert.equal(v[1].mech.short, 'MEGA');

// Tera: the usual moves, plus the Tera Move, and the changed passive; the type shows
const tera = { kind: 'tera', label: 'Charizard · Tera Dragon', sprite: 't.png', teraType: 'Dragon', passives: [null, { slot: 2, name: 'Tera P2' }, null, null], teraMoves: [mv('Tera', 'Lazulite Tera Blast', { type: 'Dragon' })] };
v = formViews({ ...base, altSprites: [tera] });
assert.equal(v.length, 2, 'the Tera form is listed');
assert.deepEqual(names(v[1].moves), ['Ember', 'Flame Burst', 'Heat Wave', 'Dragon Claw']);
assert.deepEqual(names(v[1].extra), ['Lazulite Tera Blast']);
assert.equal(v[1].extra[0].changed, true);
assert.deepEqual(names(v[1].passives), ['P1', 'Tera P2', 'P3']);
assert.equal(v[1].teraType, 'Dragon');
assert.equal(v[1].mech.short, 'TERA');
assert.equal(v[1].sync.name, 'Blast Burn');
// the normal form of that pair does not show the Tera Move
assert.deepEqual(v[0].extra, []);

// the type of each form: Terastallized, the Pokémon takes the Tera type; the Tera Move is of that type when the datamine leaves it blank
v = formViews({ ...base, type: 'Fire', altSprites: [tera, { kind: 'mega', label: 'Mega Charizard', sprite: 'm.png' }] });
assert.equal(v[0].type, 'Fire');
assert.equal(v[1].type, 'Dragon', 'Tera Dragon');
assert.equal(v[2].type, 'Fire', 'Mega keeps the type');
v = formViews({ ...base, type: 'Normal', altSprites: [{ kind: 'tera', label: 'Terapagos · Tera Stellar', sprite: 't.png', teraType: 'Stellar', teraMoves: [mv('Tera', 'Rainbow Jewel Tera Starstorm', { type: '' })] }] });
assert.equal(v[1].type, 'Stellar', 'Terapagos becomes Stellar');
assert.equal(v[1].extra[0].type, 'Stellar', 'a Tera Move with no type is of the Tera type');
assert.equal(v[0].extra.length, 0);

// Tera passives given on the pair by slot number replace the same slot in the Tera form
v = formViews({ ...base, teraPassives: [{ slot: 3, name: 'Tera P3' }, { slot: 5, name: 'Tera P5' }], altSprites: [{ kind: 'tera', label: 'x', sprite: 't.png', teraMoves: [] }] });
assert.deepEqual(names(v[1].passives), ['P1', 'P2', 'Tera P3']);
assert.deepEqual(names(v[1].extraPassives), ['Tera P5']);

// Dynamax: each Max Move takes the slot of the move it comes from, and the sync move is not part of it
v = formViews({ ...base, altSprites: [{ kind: 'dynamax', label: 'Charizard', sprite: 'd.png', maxMoves: [mv('Max', 'Max Flare', { from: 'Heat Wave', fromSlot: 3 }), mv('Max', 'Max Wyrmwind', { from: 'Dragon Claw', fromSlot: 4 })] }] });
assert.deepEqual(names(v[1].moves), ['Ember', 'Flame Burst', 'Max Flare', 'Max Wyrmwind']);
assert.equal(v[1].moves[2].replaces, 'Heat Wave');
assert.equal(v[1].sync, null);
assert.equal(v[1].mech.short, 'D-MAX');
// a Max Move whose slot is unknown goes to the extra list
v = formViews({ ...base, altSprites: [{ kind: 'gigantamax', label: 'G', sprite: 'g.png', maxMoves: [mv('Max', 'G-Max Wildfire', { from: 'Blast Burn' })] }] });
assert.deepEqual(names(v[1].extra), ['G-Max Wildfire']);
assert.equal(v[1].extra[0].replaces, 'Blast Burn');

// a pair with Tera Moves and no Tera form still lists them on the normal form
v = formViews({ ...base, teraMoves: [mv('Tera', 'Tera Blast')], altSprites: [] });
assert.deepEqual(names(v[0].extra), ['Tera Blast']);

// labels, mechanics and names
assert.equal(mechOf({ kind: 'form', label: 'Primal Groudon' }).name, 'Primal Reversion');
assert.equal(mechOf({ kind: 'form', label: 'Eternamax Eternatus' }).key, 'eternamax');
assert.equal(mechOf({ kind: 'weird', label: 'x' }).key, 'form');
assert.equal(formText('Charizard (Tera Type: Fire)'), 'Charizard');
v = formViews({ ...base, altSprites: [tera, formPair.altSprites[0]] });
assert.deepEqual(allMoveNames(v), ['Lazulite Tera Blast', 'Glorious Thunder', 'Flame Burst', 'Dragon Claw', 'Blast Burn', 'Heat Wave', 'Ember']);
console.log('pair forms: all passed');

// Focused checks of individual card interactions.
const assert = require('assert');
const { Game } = require('../shared/engine');

let clock = 0;
const now = () => clock;
function fresh(n = 2) {
  const g = new Game(Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i })), { now, startIndex: 0 });
  for (const p of g.players) { g.deck.push(...p.hand); p.hand = []; }
  return g;
}
const give = (g, p, key) => { const c = g.card(key); g.player(p).hand.push(c); return c; };
const settle = (g) => { clock += 60000; g.tick(); };
const free = (g, p) => g.player(p).field.filter((s) => Game.isFree(s)).length;
const tests = {
  'Lure moves a free gub; Blindfold cancels it'() {
    const g = fresh(); g.phase = 'play';
    const lure = give(g, 'p0', 'lure');
    const target = g.player('p1').field[0].id;
    g.act('p0', { type: 'play', cardId: lure.id, mode: 'lure', targets: [target] });
    settle(g);
    assert.strictEqual(g.score(g.player('p0')), 2);
    assert.strictEqual(g.score(g.player('p1')), 0);
    const g2 = fresh(); g2.phase = 'play';
    const l2 = give(g2, 'p0', 'lure'); const bf = give(g2, 'p1', 'blindfold');
    g2.act('p0', { type: 'play', cardId: l2.id, mode: 'lure', targets: [g2.player('p1').field[0].id] });
    assert.strictEqual(g2.viewFor('p1').prompt.kind, 'react');
    g2.act('p1', { type: 'react', cardId: bf.id });
    settle(g2);
    assert.strictEqual(g2.score(g2.player('p1')), 1);
  },
  'Protected gubs cannot be lured; Toad Rider breaks barricades'() {
    const g = fresh(); g.phase = 'play';
    const m = give(g, 'p1', 'mushroom');
    g.active = 1; g.act('p1', { type: 'play', cardId: m.id, mode: 'protect', targets: [g.player('p1').field[0].id] });
    g.active = 0;
    const lure = give(g, 'p0', 'lure');
    assert.strictEqual(g.optionsFor(g.player('p0'), lure).length, 0);
    const t = give(g, 'p0', 'toad_rider');
    const o = g.optionsFor(g.player('p0'), t).find((x) => x.mode === 'breakBarricade');
    g.act('p0', { type: 'play', cardId: t.id, mode: 'breakBarricade', targets: [o.targets[0]] });
    assert.strictEqual(free(g, 'p1'), 1);
  },
  'Feather cancels a ring; rings trap exactly N and score 0'() {
    const g = fresh(3); g.phase = 'play';
    const ring = give(g, 'p0', 'double_ring'); const fe = give(g, 'p2', 'feather');
    const ids = [g.player('p1').field[0].id, g.player('p2').field[0].id];
    assert.throws(() => g.act('p0', { type: 'play', cardId: ring.id, mode: 'ring', targets: ids.slice(0, 1) }));
    g.act('p0', { type: 'play', cardId: ring.id, mode: 'ring', targets: ids });
    g.act('p2', { type: 'react', cardId: fe.id });
    assert.strictEqual(g.pending, null);
    assert.strictEqual(g.score(g.player('p1')), 1);
    const r2 = give(g, 'p0', 'double_ring');
    g.act('p0', { type: 'play', cardId: r2.id, mode: 'ring', targets: ids });
    settle(g);
    assert.strictEqual(g.score(g.player('p0')), 1);
    assert.strictEqual(g.player('p0').field.find((s) => s.kind === 'ring').gubs.length, 2);
    const flute = give(g, 'p1', 'haki_flute'); g.active = 1;
    g.act('p1', { type: 'play', cardId: flute.id, mode: 'flute', targets: [g.player('p0').field.find((s) => s.kind === 'ring').id] });
    assert.strictEqual(g.score(g.player('p1')), 2);
  },
  'Esteemed Elder is immune except to Lightning'() {
    const g = fresh(); g.phase = 'play';
    const el = give(g, 'p1', 'esteemed_elder');
    g.active = 1; g.act('p1', { type: 'play', cardId: el.id, mode: 'gub', targets: [] }); g.active = 0;
    const elderId = g.player('p1').field.find(Game.isElder).id;
    for (const k of ['lure', 'smahl_thief', 'sud_spout', 'spear']) {
      const c = give(g, 'p0', k);
      assert(!g.optionsFor(g.player('p0'), c).some((o) => o.targets.includes(elderId)), k);
    }
    const lt = give(g, 'p0', 'lightning');
    g.act('p0', { type: 'play', cardId: lt.id, mode: 'smite', targets: [elderId] });
    settle(g);
    assert(!g.player('p1').field.some(Game.isElder));
  },
  'Cricket Song works as a Lure and as a Feather'() {
    const g = fresh(); g.phase = 'play';
    const cs = give(g, 'p0', 'cricket_song');
    g.act('p0', { type: 'play', cardId: cs.id, mode: 'lure', as: 'lure', targets: [g.player('p1').field[0].id] });
    settle(g);
    assert.strictEqual(g.score(g.player('p0')), 2);
    const cs2 = give(g, 'p1', 'cricket_song'); const sp = give(g, 'p0', 'sud_spout');
    g.act('p0', { type: 'play', cardId: sp.id, mode: 'sudSpout', targets: [g.player('p0').field[0].id] });
    assert.strictEqual(g.reactCardsFor(g.player('p1'), g.pending.play)[0].as, 'feather');
    g.act('p1', { type: 'react', cardId: cs2.id });
    assert.strictEqual(g.score(g.player('p0')), 2);
  },
  'Events: Flop Boat, Gargok Plague with Age-Old Cure, Traveling Merchant'() {
    const g = fresh(3);
    const fb = give(g, 'p2', 'flop_boat');
    g.deck.unshift(g.card('flash_flood'));
    g.act('p0', { type: 'draw' });
    assert.strictEqual(g.pending.kind, 'event');
    g.act('p2', { type: 'react', cardId: fb.id });
    assert.strictEqual(g.score(g.player('p1')), 1, 'flood was stopped');
    assert.strictEqual(g.player('p0').hand.length, 1, 'drew a replacement');

    const g2 = fresh(3);
    const cure = give(g2, 'p1', 'age_old_cure'); give(g2, 'p1', 'lure'); give(g2, 'p2', 'lure'); give(g2, 'p2', 'gub');
    g2.deck.unshift(g2.card('gargok_plague'));
    g2.act('p0', { type: 'draw' }); settle(g2);
    assert.strictEqual(g2.pending.kind, 'plague');
    g2.act('p1', { type: 'cure', cardId: cure.id }); settle(g2);
    assert.strictEqual(g2.player('p1').hand.length, 1);
    assert.strictEqual(g2.player('p2').hand.length, 0);

    const g3 = fresh(3);
    const a = give(g3, 'p0', 'lure'); give(g3, 'p0', 'spear');
    const b = give(g3, 'p1', 'gub'); const b2 = give(g3, 'p1', 'feather');
    const c = give(g3, 'p2', 'scout');
    g3.deck.unshift(g3.card('traveling_merchant'));
    g3.act('p0', { type: 'draw' }); settle(g3);
    g3.act('p0', { type: 'keep', cardId: a.id }); g3.act('p1', { type: 'keep', cardId: b.id }); g3.act('p2', { type: 'keep', cardId: c.id });
    assert(g3.player('p0').hand.some((x) => x.id === b2.id), 'P0 got P1\'s passed card');
    assert(g3.player('p2').hand.some((x) => x.key === 'spear'), 'P2 got P0\'s passed card');
  },
  'Third letter ends the game; ties go to the Elder, then fewest cards'() {
    const g = fresh();
    g.letters = [g.card('letter_g'), g.card('letter_u')];
    g.deck = g.deck.filter((c) => !['letter_b', 'letter_g', 'letter_u'].includes(c.key));
    g.deck.unshift(g.card('letter_b'));
    give(g, 'p0', 'gub');
    g.act('p0', { type: 'draw' });
    assert.strictEqual(g.phase, 'over');
    assert.deepStrictEqual(g.result.winners, ['p1'], 'fewest cards in hand wins the tie');
  },
  'Flop Boat can stop the third letter'() {
    const g = fresh(3);
    g.letters = [g.card('letter_g'), g.card('letter_u')];
    g.deck = g.deck.filter((c) => !c.key.startsWith('letter_'));
    g.deck.unshift(g.card('letter_b'));
    const fb = give(g, 'p2', 'flop_boat');
    g.act('p0', { type: 'draw' });
    assert.strictEqual(g.pending.kind, 'event');
    g.act('p2', { type: 'react', cardId: fb.id });
    assert.notStrictEqual(g.phase, 'over');
    assert.strictEqual(g.letters.length, 2);
    assert(g.deck.some((c) => c.key === 'letter_b'), 'letter went back into the deck');
  },
  'Smahl Thief takes a Sud Spout Gub free; Retreat takes back any cards on your side'() {
    const g = fresh(); g.phase = 'play';
    const target = g.player('p1').field[0];
    target.spout = g.card('sud_spout');
    const th = give(g, 'p0', 'smahl_thief');
    g.act('p0', { type: 'play', cardId: th.id, mode: 'steal', targets: [target.id] }); settle(g);
    assert.strictEqual(g.score(g.player('p0')), 2, 'stolen Gub is Free and scores');
    assert(g.discard.some((c) => c.key === 'sud_spout'));
    g.player('p0').field[0].spout = g.card('sud_spout');
    const rt = give(g, 'p0', 'retreat');
    const ids = g.player('p0').field.map((x) => x.id);
    g.act('p0', { type: 'play', cardId: rt.id, mode: 'retreat', targets: ids });
    assert.strictEqual(g.player('p0').field.length, 0);
    assert(g.player('p0').hand.some((c) => c.key === 'sud_spout'), "the opponent's Sud Spout comes back too");
  },
  'Hand limit and no skipping two turns in a row'() {
    const g = fresh();
    g.act('p0', { type: 'skipDraw' });
    for (let i = 0; i < 10; i++) give(g, 'p0', 'feather');
    g.act('p0', { type: 'endTurn' });
    assert.strictEqual(g.phase, 'discard');
    g.act('p0', { type: 'discard', cardIds: g.player('p0').hand.slice(0, 2).map((c) => c.id) });
    g.deck.unshift(g.card('gub')); // a plain draw, so no Event interrupts the turn
    g.act('p1', { type: 'draw' }); g.act('p1', { type: 'endTurn' });
    assert.throws(() => g.act('p0', { type: 'skipDraw' }), /two turns/);
  },
  'Super Lure takes free and protected gubs, barricades go home'() {
    const g = fresh(); g.phase = 'play';
    g.player('p1').field.push(g.gubStack(g.card('gub')));
    g.player('p1').field[1].barricade = g.card('velvet_moth');
    const sl = give(g, 'p0', 'super_lure');
    g.act('p0', { type: 'play', cardId: sl.id, mode: 'superLure', targets: ['p1'] }); settle(g);
    assert.strictEqual(g.score(g.player('p0')), 3);
    assert.strictEqual(g.player('p1').hand[0].key, 'velvet_moth');
  },
};
let fails = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { fails++; console.log('FAIL', name, '\n   ', e.message); }
}
if (fails) process.exit(1);

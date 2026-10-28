// Plays many all-bot games with a fake clock and checks the 70-card deck is always intact.
const assert = require('assert');
const { Game } = require('../shared/engine');
const { decide } = require('../shared/bot');
const { CARDS } = require('../shared/cards');

const TOTAL = Object.values(CARDS).reduce((n, c) => n + c.count, 0);

function countCards(g) {
  let n = g.deck.length + g.discard.length + g.letters.length + g.rings.length;
  for (const p of g.players) {
    n += p.hand.length;
    for (const s of p.field) n += 1 + !!s.barricade + !!s.spout;
  }
  const pd = g.pending;
  if (pd && pd.kind === 'react') n += 1;
  if (pd && ['event', 'merchant', 'plague'].includes(pd.kind)) n += 1;
  if (pd && pd.kind === 'arrange') n += pd.cards.length;
  return n;
}

const GAMES = Number(process.argv[2] || 2000);
let clock = 0;
const wins = {};
let turns = 0;
for (let i = 0; i < GAMES; i++) {
  const n = 2 + (i % 5);
  const g = new Game(Array.from({ length: n }, (_, k) => ({ id: 'p' + k, name: 'Bot' + k, isBot: true })), { now: () => clock });
  assert.strictEqual(TOTAL, 70);
  assert.strictEqual(countCards(g), TOTAL);
  let steps = 0;
  while (g.phase !== 'over') {
    assert(++steps < 20000, 'game did not finish');
    let acted = false;
    for (const id of g.waitingOn()) {
      const a = decide(g, id);
      if (a) { g.act(id, a); acted = true; break; }
    }
    if (!acted) { clock += 500; g.tick(); }
    assert.strictEqual(countCards(g), TOTAL, 'card count drifted after ' + JSON.stringify(g.log.slice(-3)));
    for (const p of g.players) for (const s of p.field) {
      if (s.kind === 'gub') assert(['gub', 'esteemed_elder'].includes(s.gub.key));
    }
  }
  assert(g.result && g.result.winners.length >= 1);
  turns += g.turn;
  for (const w of g.result.winners) wins[w] = (wins[w] || 0) + 1;
}
console.log(`OK: ${GAMES} games, avg ${(turns / GAMES).toFixed(1)} turns, wins by seat`, wins);

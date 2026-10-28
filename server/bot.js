// Simple heuristic opponent. decide() returns the next action for a player, or null.
const { Game, HAND_LIMIT } = require('./engine');

const VALUE = {
  esteemed_elder: 12, gub: 10, cricket_song: 9, super_lure: 9, feather: 8, triple_ring: 8, haki_flute: 7,
  double_ring: 7, lure: 6, blindfold: 6, single_ring: 6, toad_rider: 6, lightning: 6, smahl_thief: 6,
  mushroom: 5, velvet_moth: 5, sud_spout: 5, spear: 5, age_old_cure: 5, flop_boat: 4, cyclone: 4,
  omen_beetle: 4, scout: 2, retreat: 2,
};
const value = (c) => VALUE[c.key] || 3;

function decide(game, playerId) {
  const me = game.player(playerId);
  const pd = game.pending;

  if (pd) {
    if (pd.kind === 'react' && pd.eligible.includes(me.id) && !pd.passed.includes(me.id)) {
      const opts = game.reactCardsFor(me, pd.play);
      return opts.length && hurtsMe(game, me, pd.play) ? { type: 'react', cardId: opts[0].cardId } : { type: 'pass' };
    }
    if (pd.kind === 'event' && pd.eligible.includes(me.id) && !pd.passed.includes(me.id)) {
      const flop = me.hand.find((c) => c.key === 'flop_boat') || me.hand.find((c) => c.key === 'cricket_song');
      const myFree = me.field.filter((s) => Game.isFree(s) && !Game.isElder(s)).length;
      const myToads = me.field.filter((s) => s.barricade && s.barricade.key === 'toad_rider').length;
      const bad = (pd.card.key === 'flash_flood' && myFree >= 2) || (pd.card.key === 'rumor_of_wasps' && myToads >= 1)
        || (pd.card.key === 'gargok_plague' && me.hand.length >= 4);
      return bad && flop ? { type: 'react', cardId: flop.id } : { type: 'pass' };
    }
    if (pd.kind === 'plague' && pd.eligible.includes(me.id) && !pd.passed.includes(me.id)) {
      const cure = me.hand.find((c) => c.key === 'age_old_cure') || me.hand.find((c) => c.key === 'cricket_song');
      return cure && me.hand.length >= 2 ? { type: 'cure', cardId: cure.id } : { type: 'pass' };
    }
    if (pd.kind === 'merchant' && pd.waiting.includes(me.id)) {
      const best = [...me.hand].sort((a, b) => value(b) - value(a))[0];
      return { type: 'keep', cardId: best.id };
    }
    if (pd.kind === 'arrange' && pd.player === me.id) {
      return { type: 'arrange', order: pd.cards.map((c) => c.id) };
    }
    return null;
  }

  if (game.activePlayer !== me || game.phase === 'over') return null;
  if (game.phase === 'draw') return { type: 'draw' };
  if (game.phase === 'discard') {
    const need = me.hand.length - HAND_LIMIT;
    return { type: 'discard', cardIds: [...me.hand].sort((a, b) => value(a) - value(b)).slice(0, need).map((c) => c.id) };
  }

  let best = null;
  for (const card of me.hand) {
    for (const opt of game.optionsFor(me, card)) {
      const scored = scoreOption(game, me, opt);
      if (scored && (!best || scored.score > best.score)) best = { ...scored, card, opt };
    }
  }
  if (best && best.score > 0) {
    return { type: 'play', cardId: best.card.id, mode: best.opt.mode, as: best.opt.as || null, targets: best.targets };
  }
  return { type: 'endTurn' };
}

function leaderScore(game, owner) { return game.score(owner); }

function hurtsMe(game, me, play) {
  if (play.targets.includes(me.id)) return true;
  for (const t of play.targets) {
    const st = game.findStack(t);
    if (st && st.owner === me) return true;
  }
  if (play.mode === 'omen') return me.field.some((s) => s.barricade && s.barricade.key === 'mushroom');
  return false;
}

// Pick the target owned by the strongest opponent.
function pickStack(game, me, ids, filter = () => true) {
  const cands = ids.map((id) => game.findStack(id)).filter((x) => x && x.owner !== me && filter(x));
  cands.sort((a, b) => leaderScore(game, b.owner) - leaderScore(game, a.owner));
  return cands[0] || null;
}

function scoreOption(game, me, opt) {
  const t = (x) => ({ score: x.score, targets: x.targets });
  switch (opt.mode) {
    case 'gub': return t({ score: 100, targets: [] });
    case 'protect': return t({ score: 50, targets: [opt.targets[0]] });
    case 'cure': return t({ score: 45, targets: [] });
    case 'lure': { const s = pickStack(game, me, opt.targets); return s && t({ score: 60, targets: [s.stack.id] }); }
    case 'steal': {
      const s = pickStack(game, me, opt.targets, (x) => !x.stack.spout);
      return s && t({ score: s.stack.barricade ? 48 : 40, targets: [s.stack.id] });
    }
    case 'superLure': {
      const ps = opt.targets.map((id) => game.player(id)).sort((a, b) => game.score(b) - game.score(a));
      const n = ps[0].field.filter((s) => Game.scores(s) && !Game.isElder(s)).length;
      return n >= 2 && t({ score: 20 * n, targets: [ps[0].id] });
    }
    case 'ring': {
      const cands = opt.targets.map((id) => game.findStack(id)).filter((x) => x.owner !== me);
      return cands.length >= opt.count && t({ score: 30 * opt.count, targets: cands.slice(0, opt.count).map((x) => x.stack.id) });
    }
    case 'sudSpout': { const s = pickStack(game, me, opt.targets); return s && t({ score: 35, targets: [s.stack.id] }); }
    case 'spearKill': { const s = pickStack(game, me, opt.targets); return s && t({ score: 30, targets: [s.stack.id] }); }
    case 'spearSpout': {
      const mine = opt.targets.map((id) => game.findStack(id)).find((x) => x.owner === me);
      return mine && t({ score: 40, targets: [mine.stack.id] });
    }
    case 'flute': {
      const rings = opt.targets.map((id) => game.findStack(id)).sort((a, b) => b.stack.gubs.length - a.stack.gubs.length);
      return t({ score: 30 * rings[0].stack.gubs.length, targets: [rings[0].stack.id] });
    }
    case 'breakBarricade': { const s = pickStack(game, me, opt.targets); return s && t({ score: 15, targets: [s.stack.id] }); }
    case 'cyclone': {
      const ps = opt.targets.map((id) => game.player(id)).map((p) => ({ p, n: p.field.filter((s) => s.barricade).length })).sort((a, b) => b.n - a.n);
      return ps[0].n >= 2 && t({ score: 12 * ps[0].n, targets: [ps[0].p.id] });
    }
    case 'omen': {
      let diff = 0;
      for (const { owner, stack } of game.allStacks()) if (stack.barricade && stack.barricade.key === 'mushroom') diff += owner === me ? -1 : 1;
      return diff > 0 && t({ score: 25 * diff, targets: [] });
    }
    case 'smite': return t({ score: 50, targets: [opt.targets[0]] });
    case 'zap': {
      const ps = opt.targets.map((id) => game.player(id)).sort((a, b) => b.hand.length - a.hand.length);
      return ps[0].hand.length >= 4 && t({ score: 20 + ps[0].hand.length * 3, targets: [ps[0].id] });
    }
    default: return null; // scout, retreat: bots skip these
  }
}

module.exports = { decide };

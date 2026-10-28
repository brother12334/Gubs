// Authoritative GUBS rules engine. One Game instance per room (or per solo game in the browser).
// Works in Node (require) and in the browser (window.GUBS_ENGINE).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./cards'));
  else root.GUBS_ENGINE = factory(root.GUBS_CARDS);
})(typeof window !== 'undefined' ? window : globalThis, function ({ CARDS, WILD_TARGETS }) {
  const HAND_LIMIT = 8;
  const REACT_MS = 20000; // time players get to play an Interrupt
  const REACT_MIN_MS = 1200; // windows stay open at least this long so waiting reveals little
  const CHOICE_MS = 30000; // Traveling Merchant / Gargok Plague / Scout choices

  const HAZARD_MODES = new Set(['lure', 'superLure', 'cyclone', 'omen', 'steal', 'smite', 'zap', 'spearKill']);
  const TRAP_MODES = new Set(['sudSpout', 'ring']);
  const LURE_MODES = new Set(['lure', 'superLure']);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  class Game {
    constructor(players, opts = {}) {
      if (players.length < 2 || players.length > 6) throw new Error('GUBS needs 2-6 players');
      this.now = opts.now || (() => Date.now());
      this.nextId = 1;
      this.players = players.map((p) => ({
        id: p.id, name: p.name, isBot: !!p.isBot, hand: [], field: [], skippedLast: false, reveal: null,
      }));
      this.deck = [];
      this.discard = [];
      this.letters = [];
      this.log = [];
      this.turn = 0;
      this.active = 0;
      this.phase = 'draw'; // draw | play | discard | over
      this.pending = null;
      this.result = null;
      this.version = 0;
      this.lastAction = null; // most recent card played, cancelled or drawn as an Event (for the spotlight)
      this.setup(opts.startIndex);
    }

    // ---------- setup ----------
    card(key) { return { id: 'c' + this.nextId++, key }; }

    setup(startIndex) {
      const n = this.players.length;
      let body = [];
      let letters = [];
      for (const [key, def] of Object.entries(CARDS)) {
        for (let i = 0; i < def.count; i++) {
          const c = this.card(key);
          if (def.type === 'letter') letters.push(c);
          else body.push(c);
        }
      }
      // Each player starts with one Gub in play (never the Esteemed Elder).
      for (const p of this.players) {
        const idx = body.findIndex((c) => c.key === 'gub');
        const [g] = body.splice(idx, 1);
        p.field.push(this.gubStack(g));
      }
      shuffle(body);
      shuffle(letters);
      // One letter near the top, one in the middle, one near the bottom.
      const third = Math.floor(body.length / 3);
      const pos = [
        3 + n * 3 + Math.floor(Math.random() * Math.max(1, third - n * 3 - 3)),
        third + Math.floor(Math.random() * third),
        2 * third + Math.floor(Math.random() * (body.length - 2 * third)),
      ].sort((a, b) => b - a);
      pos.forEach((p, i) => body.splice(p, 0, letters[i]));
      this.deck = body;

      // Deal three cards; Events (incl. Letters) go back into the deck and are replaced.
      for (const p of this.players) {
        while (p.hand.length < 3) {
          const c = this.deck.shift();
          if (this.isEventish(c)) this.insertRandom([c], 3);
          else p.hand.push(c);
        }
      }
      this.active = startIndex != null ? startIndex : Math.floor(Math.random() * n);
      this.turn = 1;
      this.phase = 'draw';
      this.addLog(`Game started. ${this.players[this.active].name} goes first.`);
    }

    gubStack(gub) { return { id: 's' + this.nextId++, kind: 'gub', gub, barricade: null, spout: null }; }

    isEventish(c) { const t = CARDS[c.key].type; return t === 'event' || t === 'letter'; }

    insertRandom(cards, minIndex = 0) {
      for (const c of cards) {
        const lo = Math.min(minIndex, this.deck.length);
        const at = lo + Math.floor(Math.random() * (this.deck.length - lo + 1));
        this.deck.splice(at, 0, c);
      }
    }

    spotlight(actor, card, as, label) {
      this.lastAction = { seq: (this.lastAction ? this.lastAction.seq : 0) + 1, actor, card, as, label };
    }

    addLog(text) {
      this.log.push({ t: this.now(), text });
      if (this.log.length > 200) this.log.shift();
    }

    // ---------- lookups ----------
    player(id) { const p = this.players.find((x) => x.id === id); if (!p) throw new Error('Unknown player'); return p; }
    get activePlayer() { return this.players[this.active]; }
    allStacks() { const out = []; for (const p of this.players) for (const s of p.field) out.push({ owner: p, stack: s }); return out; }
    findStack(id) { return this.allStacks().find((x) => x.stack.id === id) || null; }
    removeStack(owner, stack) { owner.field = owner.field.filter((s) => s !== stack); }

    static isElder(s) { return s.kind === 'gub' && s.gub.key === 'esteemed_elder'; }
    static isFree(s) { return s.kind === 'gub' && !s.barricade && !s.spout; }
    static isProtected(s) { return s.kind === 'gub' && !!s.barricade && !s.spout; }
    static scores(s) { return s.kind === 'gub' && !s.spout; }

    score(p) { return p.field.filter(Game.scores).length; }

    stackLabel(owner, s, viewer) {
      if (viewer === owner) return this.stackLabel({ name: 'their own' }, s).replace("their own's", 'their own');
      if (s.kind === 'ring') return `${owner.name}'s ${CARDS[s.ring.key].name} (${s.gubs.length} trapped)`;
      if (Game.isElder(s)) return `${owner.name}'s Esteemed Elder`;
      if (s.spout) return `${owner.name}'s trapped Gub`;
      if (s.barricade) return `${owner.name}'s ${CARDS[s.barricade.key].name}-protected Gub`;
      return `${owner.name}'s Free Gub`;
    }

    // ---------- play options ----------
    // Returns everything the active player could do with a card from their hand right now.
    optionsFor(p, card) {
      if (CARDS[card.key].type === 'wild') {
        const out = [];
        for (const k of WILD_TARGETS) {
          for (const o of this.optionsForKey(p, k)) out.push({ ...o, as: k, label: `As ${CARDS[k].name}: ${o.label}` });
        }
        return out;
      }
      return this.optionsForKey(p, card.key);
    }

    optionsForKey(p, key) {
      const all = this.allStacks();
      const opp = all.filter((x) => x.owner !== p);
      const ids = (xs) => xs.map((x) => x.stack.id);
      const freeAny = all.filter((x) => Game.isFree(x.stack) && !Game.isElder(x.stack));
      const oppPlayers = this.players.filter((x) => x !== p);
      const o = [];
      const add = (mode, label, target, targets, extra = {}) => {
        if (target === 'none' || targets.length) o.push({ mode, label, target, targets, ...extra });
      };
      switch (key) {
        case 'gub':
        case 'esteemed_elder':
          add('gub', 'Put into play', 'none', []);
          break;
        case 'mushroom':
        case 'toad_rider':
        case 'velvet_moth':
          add('protect', 'Protect one of your Gubs', 'stack',
            ids(p.field.filter((s) => Game.isFree(s) && !Game.isElder(s)).map((s) => ({ stack: s }))));
          if (key === 'mushroom') add('breakBarricade', 'Discard a Mushroom in play', 'stack', ids(all.filter((x) => x.stack.barricade && x.stack.barricade.key === 'mushroom')));
          if (key === 'toad_rider') add('breakBarricade', 'Discard a Barricade in play', 'stack', ids(all.filter((x) => x.stack.barricade)));
          break;
        case 'lure':
          add('lure', 'Lure a Free Gub to your side', 'stack', ids(opp.filter((x) => Game.isFree(x.stack) && !Game.isElder(x.stack))));
          break;
        case 'super_lure':
          add('superLure', "Lure all of a player's Free & Protected Gubs", 'player',
            oppPlayers.filter((q) => q.field.some((s) => Game.scores(s) && !Game.isElder(s))).map((q) => q.id));
          break;
        case 'cyclone':
          add('cyclone', "Destroy a player's Barricades", 'player', oppPlayers.filter((q) => q.field.some((s) => s.barricade)).map((q) => q.id));
          break;
        case 'omen_beetle':
          if (all.some((x) => x.stack.barricade && x.stack.barricade.key === 'mushroom')) add('omen', 'Discard all Mushrooms and the Gubs behind them', 'none', []);
          break;
        case 'smahl_thief':
          add('steal', 'Steal a Gub (with whatever is on it)', 'stack', ids(opp.filter((x) => x.stack.kind === 'gub' && !Game.isElder(x.stack))));
          break;
        case 'lightning':
          add('smite', 'Smite the Esteemed Elder', 'stack', ids(opp.filter((x) => Game.isElder(x.stack))));
          add('zap', 'Force a player to discard their hand', 'player', oppPlayers.filter((q) => q.hand.length).map((q) => q.id));
          break;
        case 'sud_spout':
          add('sudSpout', 'Trap a Free Gub where it is', 'stack', ids(freeAny));
          break;
        case 'single_ring':
        case 'double_ring':
        case 'triple_ring': {
          const n = CARDS[key].ring;
          if (freeAny.length >= n) add('ring', `Trap exactly ${n} Free Gub${n > 1 ? 's' : ''}`, 'stacks', ids(freeAny), { count: n });
          break;
        }
        case 'spear':
          add('spearSpout', 'Tool: destroy a Sud Spout', 'stack', ids(all.filter((x) => x.stack.spout)));
          add('spearKill', 'Hazard: kill a Free Gub', 'stack', ids(freeAny));
          break;
        case 'haki_flute':
          add('flute', 'Shatter a Ring and win its Gubs', 'stack', ids(all.filter((x) => x.stack.kind === 'ring')));
          break;
        case 'scout':
          add('scoutLook', "Look at a player's hand", 'player', oppPlayers.filter((q) => q.hand.length).map((q) => q.id));
          if (this.deck.length) add('scoutArrange', 'Rearrange the top three cards of the deck', 'none', []);
          break;
        case 'retreat':
          add('retreat', 'Take cards on your side back into your hand', 'stacks',
            p.field.filter((s) => !Game.isElder(s)).map((s) => s.id), { min: 1 });
          break;
        case 'age_old_cure':
          if (this.discard.some((c) => c.key === 'gub')) add('cure', 'Take a Gub from the discard pile', 'none', []);
          break;
        default:
          break; // feather, blindfold, flop_boat: only as responses
      }
      return o;
    }

    // ---------- actions ----------
    act(playerId, msg) {
      if (this.phase === 'over') throw new Error('The game is over');
      const p = this.player(playerId);
      const fn = {
        draw: this.doDraw, skipDraw: this.doSkipDraw, play: this.doPlay, endTurn: this.doEndTurn,
        discard: this.doDiscard, react: this.doReact, pass: this.doPass, keep: this.doKeep,
        cure: this.doCure, arrange: this.doArrange, dismiss: this.doDismiss,
      }[msg && msg.type];
      if (!fn) throw new Error('Unknown action');
      fn.call(this, p, msg);
      this.version++;
    }

    requireTurn(p, phase) {
      if (this.pending) throw new Error('Waiting for other players');
      if (this.activePlayer !== p) throw new Error('Not your turn');
      if (phase && this.phase !== phase) throw new Error(`You can't do that now`);
    }

    takeFromHand(p, cardId) {
      const i = p.hand.findIndex((c) => c.id === cardId);
      if (i < 0) throw new Error('Card not in hand');
      return p.hand.splice(i, 1)[0];
    }

    doDraw(p) {
      this.requireTurn(p, 'draw');
      p.skippedLast = false;
      this.phase = 'play';
      this.drawFor(p);
    }

    doSkipDraw(p) {
      this.requireTurn(p, 'draw');
      if (p.skippedLast) throw new Error("You can't skip drawing two turns in a row");
      p.skippedLast = true;
      this.phase = 'play';
      this.addLog(`${p.name} chooses not to draw.`);
    }

    drawFor(p) {
      for (;;) {
        if (!this.deck.length) { this.addLog('The deck is empty.'); return; }
        const c = this.deck.shift();
        const def = CARDS[c.key];
        if (def.type === 'letter') {
          this.spotlight(p.id, c, null, `Letter ${def.name}!`);
          this.addLog(`${p.name} draws the letter ${def.name}!`);
          // Letters are Events: a Flop Boat can send one back before it counts (even the third).
          if (this.players.some((q) => q.hand.some((x) => x.key === 'flop_boat' || x.key === 'cricket_song'))) {
            this.openEvent(p, c);
            return;
          }
          if (this.resolveLetter(c)) return;
          continue; // draw a replacement
        }
        if (def.type === 'event') {
          this.spotlight(p.id, c, null, def.name);
          this.addLog(`${p.name} draws an Event: ${def.name}!`);
          this.openEvent(p, c);
          return;
        }
        p.hand.push(c);
        this.addLog(`${p.name} draws a card.`);
        return;
      }
    }

    doPlay(p, msg) {
      this.requireTurn(p, 'play');
      const card = p.hand.find((c) => c.id === msg.cardId);
      if (!card) throw new Error('Card not in hand');
      const opt = this.optionsFor(p, card).find((o) => o.mode === msg.mode && (o.as || null) === (msg.as || null));
      if (!opt) throw new Error("That card can't be played that way right now");
      let targets = Array.isArray(msg.targets) ? [...new Set(msg.targets)] : [];
      if (opt.target === 'none') targets = [];
      else if (opt.target === 'stack' || opt.target === 'player') {
        if (targets.length !== 1 || !opt.targets.includes(targets[0])) throw new Error('Pick a valid target');
      } else if (opt.target === 'stacks') {
        if (!targets.every((t) => opt.targets.includes(t))) throw new Error('Pick valid targets');
        if (opt.count && targets.length !== opt.count) throw new Error(`Pick exactly ${opt.count}`);
        if (opt.min && targets.length < opt.min) throw new Error('Pick at least one');
      }
      this.takeFromHand(p, card.id);
      const play = { actor: p.id, card, as: opt.as || null, mode: opt.mode, targets };
      const desc = this.describePlay(play);
      this.spotlight(p.id, card, play.as, CARDS[play.as || card.key].name);
      if (HAZARD_MODES.has(play.mode) || TRAP_MODES.has(play.mode)) {
        this.addLog(`${p.name} plays ${desc}`);
        this.openReaction(play);
      } else {
        this.addLog(`${p.name} plays ${desc}`);
        this.resolvePlay(play);
      }
    }

    describePlay(play) {
      const name = CARDS[play.card.key].name + (play.as ? ` as ${CARDS[play.as].name}` : '');
      const tl = play.targets.map((t) => {
        const st = this.findStack(t);
        if (st) return this.stackLabel(st.owner, st.stack, this.player(play.actor));
        const q = this.players.find((x) => x.id === t);
        return q ? q.name : '?';
      });
      const extra = {
        gub: '', protect: ` on ${tl[0]}`, breakBarricade: ` to discard the Barricade on ${tl[0]}`,
        lure: ` on ${tl[0]}`, superLure: ` on ${tl[0]}`, cyclone: ` on ${tl[0]}`, omen: '',
        steal: ` to steal ${tl[0]}`, smite: ` on ${tl[0]}`, zap: ` on ${tl[0]}'s hand`,
        sudSpout: ` on ${tl[0]}`, ring: ` on ${tl.join(', ')}`, spearSpout: ` to destroy the Sud Spout on ${tl[0]}`,
        spearKill: ` to kill ${tl[0]}`, flute: ` on ${tl[0]}`, scoutLook: ` to look at ${tl[0]}'s hand`,
        scoutArrange: ' to rearrange the top of the deck', retreat: ` to take back ${tl.length} stack(s)`,
        cure: ' to take a Gub from the discard pile',
      }[play.mode] || '';
      return name + extra + '.';
    }

    resolvePlay(play) {
      const p = this.player(play.actor);
      const { card, targets } = play;
      const key = play.as || card.key;
      const discardCard = () => this.discard.push(card);
      const st = targets.length ? this.findStack(targets[0]) : null;
      const tp = targets.length ? this.players.find((x) => x.id === targets[0]) : null;
      switch (play.mode) {
        case 'gub':
          p.field.push(this.gubStack(card));
          break;
        case 'protect':
          st.stack.barricade = card;
          break;
        case 'breakBarricade':
          this.discard.push(st.stack.barricade);
          st.stack.barricade = null;
          discardCard();
          break;
        case 'lure':
          this.removeStack(st.owner, st.stack);
          p.field.push(st.stack);
          discardCard();
          break;
        case 'superLure': {
          const moving = tp.field.filter((s) => Game.scores(s) && !Game.isElder(s));
          for (const s of moving) {
            if (s.barricade) { tp.hand.push(s.barricade); s.barricade = null; }
            this.removeStack(tp, s);
            p.field.push(s);
          }
          this.addLog(`${moving.length} Gub(s) follow the Super Lure to ${p.name}.`);
          discardCard();
          break;
        }
        case 'cyclone':
          for (const s of tp.field) if (s.barricade) { this.discard.push(s.barricade); s.barricade = null; }
          discardCard();
          break;
        case 'omen': {
          let n = 0;
          for (const { owner, stack } of this.allStacks()) {
            if (stack.barricade && stack.barricade.key === 'mushroom') {
              this.discard.push(stack.barricade, stack.gub);
              this.removeStack(owner, stack);
              n++;
            }
          }
          this.addLog(`${n} Mushroom(s) and their Gubs are devoured.`);
          discardCard();
          break;
        }
        case 'steal':
          this.removeStack(st.owner, st.stack);
          if (st.stack.spout) { this.discard.push(st.stack.spout); st.stack.spout = null; } // the Gub comes away Free
          p.field.push(st.stack);
          discardCard();
          break;
        case 'smite':
          this.discard.push(st.stack.gub);
          this.removeStack(st.owner, st.stack);
          discardCard();
          break;
        case 'zap':
          this.discard.push(...tp.hand);
          tp.hand = [];
          discardCard();
          break;
        case 'sudSpout':
          st.stack.spout = card;
          break;
        case 'ring': {
          const gubs = [];
          for (const id of targets) {
            const x = this.findStack(id);
            this.removeStack(x.owner, x.stack);
            gubs.push(x.stack.gub);
          }
          p.field.push({ id: 's' + this.nextId++, kind: 'ring', ring: card, gubs });
          break;
        }
        case 'spearSpout':
          this.discard.push(st.stack.spout);
          st.stack.spout = null;
          discardCard();
          break;
        case 'spearKill':
          this.discard.push(st.stack.gub);
          this.removeStack(st.owner, st.stack);
          discardCard();
          break;
        case 'flute':
          this.discard.push(st.stack.ring);
          this.removeStack(st.owner, st.stack);
          for (const g of st.stack.gubs) p.field.push(this.gubStack(g));
          this.addLog(`${st.stack.gubs.length} Gub(s) are freed and join ${p.name}.`);
          discardCard();
          break;
        case 'scoutLook':
          p.reveal = { title: `${tp.name}'s hand`, cards: tp.hand.map((c) => ({ ...c })) };
          discardCard();
          break;
        case 'scoutArrange':
          discardCard();
          this.pending = { kind: 'arrange', player: p.id, cards: this.deck.splice(0, 3), deadline: this.now() + CHOICE_MS * 2 };
          break;
        case 'retreat':
          for (const id of targets) {
            const x = this.findStack(id);
            if (x.stack.kind === 'ring') p.hand.push(x.stack.ring, ...x.stack.gubs);
            else p.hand.push(...[x.stack.gub, x.stack.barricade, x.stack.spout].filter(Boolean));
            this.removeStack(p, x.stack);
          }
          discardCard();
          break;
        case 'cure': {
          const i = this.discard.findIndex((c) => c.key === 'gub');
          p.hand.push(this.discard.splice(i, 1)[0]);
          discardCard();
          break;
        }
        default:
          throw new Error('Unhandled mode ' + play.mode + ' for ' + key);
      }
    }

    // ---------- interrupt windows ----------
    reactCardsFor(p, play) {
      const out = [];
      const isHazTrap = HAZARD_MODES.has(play.mode) || TRAP_MODES.has(play.mode);
      const isLure = LURE_MODES.has(play.mode);
      for (const c of p.hand) {
        if (c.key === 'feather' && isHazTrap) out.push({ cardId: c.id, as: null, label: 'Feather: cancel it' });
        if (c.key === 'blindfold' && isLure) out.push({ cardId: c.id, as: null, label: 'Blindfold: cancel it' });
        if (c.key === 'cricket_song') {
          if (isHazTrap) out.push({ cardId: c.id, as: 'feather', label: 'Cricket Song as Feather: cancel it' });
          else if (isLure) out.push({ cardId: c.id, as: 'blindfold', label: 'Cricket Song as Blindfold: cancel it' });
        }
      }
      return out;
    }

    openReaction(play) {
      const now = this.now();
      const eligible = this.players.filter((q) => q.id !== play.actor && this.reactCardsFor(q, play).length).map((q) => q.id);
      this.pending = { kind: 'react', play, eligible, passed: [], opened: now, deadline: now + REACT_MS };
    }

    doReact(p, msg) {
      const pd = this.pending;
      // While an Event is pending, reacting means playing a Flop Boat.
      if (pd && pd.kind === 'event' && pd.eligible.includes(p.id) && !pd.passed.includes(p.id)) return this.flopBoat(p, msg.cardId);
      if (!pd || pd.kind !== 'react' || !pd.eligible.includes(p.id) || pd.passed.includes(p.id)) throw new Error('Nothing to react to');
      const opt = this.reactCardsFor(p, pd.play).find((o) => o.cardId === msg.cardId);
      if (!opt) throw new Error("That card can't cancel this");
      const c = this.takeFromHand(p, msg.cardId);
      this.spotlight(p.id, c, opt.as, 'Cancelled!');
      this.discard.push(c, pd.play.card);
      this.addLog(`${p.name} plays ${CARDS[c.key].name}${opt.as ? ' as ' + CARDS[opt.as].name : ''}! ${CARDS[pd.play.card.key].name} is cancelled.`);
      this.pending = null;
    }

    doPass(p) {
      const pd = this.pending;
      if (!pd || !pd.eligible || !pd.eligible.includes(p.id)) throw new Error('Nothing to pass on');
      if (!pd.passed.includes(p.id)) pd.passed.push(p.id);
    }

    // ---------- events ----------
    openEvent(drawer, card) {
      const now = this.now();
      const eligible = this.players.filter((q) => q.hand.some((c) => c.key === 'flop_boat' || c.key === 'cricket_song')).map((q) => q.id);
      this.pending = { kind: 'event', drawer: drawer.id, card, eligible, passed: [], opened: now, deadline: now + REACT_MS };
    }

    // Flop Boat is played through the generic react action while an event is pending.
    flopBoat(p, cardId) {
      const pd = this.pending;
      const c = p.hand.find((x) => x.id === cardId);
      if (!c || !(c.key === 'flop_boat' || c.key === 'cricket_song')) throw new Error('Not a Flop Boat');
      this.takeFromHand(p, cardId);
      this.spotlight(p.id, c, c.key === 'cricket_song' ? 'flop_boat' : null, 'Flop Boat!');
      this.discard.push(c);
      this.insertRandom([pd.card]);
      this.addLog(`${p.name} plays ${CARDS[c.key].name}${c.key === 'cricket_song' ? ' as Flop Boat' : ''}! ${CARDS[pd.card.key].name} is shuffled back into the deck.`);
      const drawer = this.player(pd.drawer);
      this.pending = null;
      this.drawFor(drawer);
    }

    // Counts a drawn letter; returns true if it ended the game.
    resolveLetter(c) {
      this.letters.push(c);
      this.addLog(`The letter ${CARDS[c.key].name} counts (${this.letters.length}/3).`);
      if (this.letters.length >= 3) { this.endGame(); return true; }
      return false;
    }

    resolveEvent() {
      const { card, drawer } = this.pending;
      const d = this.player(drawer);
      this.pending = null;
      if (CARDS[card.key].type === 'letter') {
        if (!this.resolveLetter(card)) this.drawFor(d);
        return;
      }
      const now = this.now();
      switch (card.key) {
        case 'traveling_merchant': {
          const who = this.players.filter((q) => q.hand.length).map((q) => q.id);
          this.pending = { kind: 'merchant', card, drawer, keep: {}, waiting: who, deadline: now + CHOICE_MS };
          if (!who.length) this.finishMerchant();
          return;
        }
        case 'gargok_plague': {
          const who = this.players.filter((q) => q.hand.length && q.hand.some((c) => c.key === 'age_old_cure' || c.key === 'cricket_song')).map((q) => q.id);
          this.pending = { kind: 'plague', card, drawer, cured: [], eligible: who, passed: [], opened: now, deadline: now + CHOICE_MS };
          return;
        }
        case 'flash_flood': {
          let n = 0;
          for (const { owner, stack } of this.allStacks()) {
            if (Game.isFree(stack) && !Game.isElder(stack)) { this.removeStack(owner, stack); this.insertRandom([stack.gub]); n++; }
          }
          this.addLog(`Flash Flood! ${n} Free Gub(s) are washed back into the deck.`);
          break;
        }
        case 'rumor_of_wasps': {
          let n = 0;
          for (const { owner, stack } of this.allStacks()) {
            if (stack.barricade && stack.barricade.key === 'toad_rider') {
              this.removeStack(owner, stack);
              this.insertRandom([stack.barricade, stack.gub]);
              n++;
            }
          }
          this.addLog(`Rumor of Wasps! ${n} Toad Rider(s) ride off with their Gubs.`);
          break;
        }
        default:
          break;
      }
      this.discard.push(card);
      this.drawFor(d);
    }

    doKeep(p, msg) {
      const pd = this.pending;
      if (!pd || pd.kind !== 'merchant' || !pd.waiting.includes(p.id)) throw new Error('Nothing to choose');
      if (!p.hand.some((c) => c.id === msg.cardId)) throw new Error('Card not in hand');
      pd.keep[p.id] = msg.cardId;
      pd.waiting = pd.waiting.filter((x) => x !== p.id);
      if (!pd.waiting.length) this.finishMerchant();
    }

    finishMerchant() {
      const pd = this.pending;
      const n = this.players.length;
      // Pass to the right: each player receives the hand of the player on their left (next in turn order).
      const passing = this.players.map((q) => {
        const keepId = pd.keep[q.id];
        const kept = q.hand.filter((c) => c.id === keepId);
        const rest = q.hand.filter((c) => c.id !== keepId);
        q.hand = kept;
        return rest;
      });
      this.players.forEach((q, i) => {
        const fromLeft = passing[(i + 1) % n];
        q.hand.push(...fromLeft);
      });
      this.addLog('Traveling Merchant! Everyone keeps one card and passes the rest to the right.');
      this.discard.push(pd.card);
      const d = this.player(pd.drawer);
      this.pending = null;
      this.drawFor(d);
    }

    doCure(p, msg) {
      const pd = this.pending;
      if (!pd || pd.kind !== 'plague' || !pd.eligible.includes(p.id) || pd.passed.includes(p.id)) throw new Error('Nothing to cure');
      const c = p.hand.find((x) => x.id === msg.cardId);
      if (!c || !(c.key === 'age_old_cure' || c.key === 'cricket_song')) throw new Error('Not an Age-Old Cure');
      this.takeFromHand(p, c.id);
      this.discard.push(c);
      pd.cured.push(p.id);
      pd.passed.push(p.id);
      this.addLog(`${p.name} drinks ${CARDS[c.key].name}${c.key === 'cricket_song' ? ' as Age-Old Cure' : ''} and keeps their hand.`);
    }

    finishPlague() {
      const pd = this.pending;
      const hit = [];
      for (const q of this.players) {
        if (pd.cured.includes(q.id) || !q.hand.length) continue;
        this.insertRandom(q.hand);
        q.hand = [];
        hit.push(q.name);
      }
      this.addLog(`Gargok Plague! ${hit.length ? hit.join(', ') + ' shuffle their hands into the deck.' : 'Nobody is affected.'}`);
      this.discard.push(pd.card);
      const d = this.player(pd.drawer);
      this.pending = null;
      this.drawFor(d);
    }

    // ---------- scout ----------
    doArrange(p, msg) {
      const pd = this.pending;
      if (!pd || pd.kind !== 'arrange' || pd.player !== p.id) throw new Error('Nothing to arrange');
      const order = msg.order || [];
      const ids = pd.cards.map((c) => c.id);
      if (order.length !== ids.length || !ids.every((id) => order.includes(id))) throw new Error('Bad order');
      this.deck.unshift(...order.map((id) => pd.cards.find((c) => c.id === id)));
      this.addLog(`${p.name} rearranges the top of the deck.`);
      this.pending = null;
    }

    doDismiss(p) { p.reveal = null; }

    // ---------- end of turn ----------
    doEndTurn(p) {
      this.requireTurn(p);
      if (this.phase === 'draw') throw new Error('Draw (or skip drawing) first');
      if (this.phase !== 'play') throw new Error("You can't end your turn now");
      if (p.hand.length > HAND_LIMIT) { this.phase = 'discard'; return; }
      this.nextTurn();
    }

    doDiscard(p, msg) {
      this.requireTurn(p, 'discard');
      const need = p.hand.length - HAND_LIMIT;
      const ids = [...new Set(msg.cardIds || [])];
      if (ids.length !== need) throw new Error(`Discard exactly ${need} card(s)`);
      for (const id of ids) this.discard.push(this.takeFromHand(p, id));
      this.addLog(`${p.name} discards ${need} card(s) down to ${HAND_LIMIT}.`);
      this.nextTurn();
    }

    nextTurn() {
      this.players.forEach((q) => { q.reveal = null; });
      this.active = (this.active + 1) % this.players.length;
      this.turn++;
      this.phase = 'draw';
      this.addLog(`Go! It's ${this.activePlayer.name}'s turn.`);
    }

    endGame() {
      this.phase = 'over';
      this.pending = null;
      const rows = this.players.map((q) => ({
        id: q.id, name: q.name, score: this.score(q), elder: q.field.some((s) => Game.isElder(s)), hand: q.hand.length,
      }));
      const best = Math.max(...rows.map((r) => r.score));
      let tied = rows.filter((r) => r.score === best);
      let reason = 'most Gubs';
      if (tied.length > 1) {
        const elder = tied.find((r) => r.elder);
        if (elder) { tied = [elder]; reason = 'tie broken by the Esteemed Elder'; } else {
          const fewest = Math.min(...tied.map((r) => r.hand));
          tied = tied.filter((r) => r.hand === fewest);
          reason = 'tie broken by fewest cards in hand';
        }
      }
      this.result = { rows, winners: tied.map((r) => r.id), reason };
      this.addLog(`G-U-B! The game is over. ${tied.map((r) => r.name).join(' & ')} win${tied.length > 1 ? '' : 's'} (${reason}).`);
    }

    // ---------- time ----------
    // Called periodically; closes windows whose time is up. Returns true if state changed.
    tick() {
      const pd = this.pending;
      if (!pd || this.phase === 'over') return false;
      const now = this.now();
      const allPassed = pd.eligible && pd.eligible.every((id) => pd.passed.includes(id));
      const before = this.version;
      if (pd.kind === 'react') {
        if ((allPassed && now - pd.opened >= REACT_MIN_MS) || now >= pd.deadline) {
          this.pending = null;
          this.resolvePlay(pd.play);
        }
      } else if (pd.kind === 'event') {
        if ((allPassed && now - pd.opened >= REACT_MIN_MS) || now >= pd.deadline) this.resolveEvent();
      } else if (pd.kind === 'plague') {
        if ((allPassed && now - pd.opened >= REACT_MIN_MS) || now >= pd.deadline) this.finishPlague();
      } else if (pd.kind === 'merchant') {
        if (now >= pd.deadline) {
          for (const id of pd.waiting) { const q = this.player(id); pd.keep[id] = q.hand[0] && q.hand[0].id; }
          pd.waiting = [];
          this.finishMerchant();
        }
      } else if (pd.kind === 'arrange') {
        if (now >= pd.deadline) this.doArrange(this.player(pd.player), { order: pd.cards.map((c) => c.id) });
      }
      if (this.pending !== pd) { this.version++; return true; }
      return this.version !== before;
    }

    // Players whose input the game is waiting on (used to drive bots and idle players).
    waitingOn() {
      if (this.phase === 'over') return [];
      const pd = this.pending;
      if (!pd) return [this.activePlayer.id];
      if (pd.kind === 'merchant') return [...pd.waiting];
      if (pd.kind === 'arrange') return [pd.player];
      return pd.eligible.filter((id) => !pd.passed.includes(id));
    }

    // ---------- views ----------
    publicStack(s) {
      if (s.kind === 'ring') return { id: s.id, kind: 'ring', ring: s.ring, gubs: s.gubs };
      return {
        id: s.id, kind: 'gub', gub: s.gub, barricade: s.barricade, spout: s.spout,
        state: s.spout ? 'trapped' : s.barricade ? 'protected' : 'free', elder: Game.isElder(s),
      };
    }

    viewFor(playerId) {
      const me = this.players.find((p) => p.id === playerId) || null;
      const pd = this.pending;
      const view = {
        version: this.version,
        phase: this.phase,
        turn: this.turn,
        active: this.activePlayer.id,
        you: me ? me.id : null,
        players: this.players.map((q) => ({
          id: q.id, name: q.name, isBot: q.isBot, handCount: q.hand.length, score: this.score(q),
          skippedLast: q.skippedLast, field: q.field.map((s) => this.publicStack(s)),
        })),
        deckCount: this.deck.length,
        discard: this.discard.slice(-6),
        discardCount: this.discard.length,
        letters: this.letters,
        lastAction: this.lastAction,
        log: this.log.slice(-80),
        result: this.result,
        handLimit: HAND_LIMIT,
        pending: null,
        prompt: null,
        hand: [],
        reveal: me ? me.reveal : null,
      };
      if (pd) {
        const pub = { kind: pd.kind, deadline: pd.deadline, waitingOn: this.waitingOn() };
        if (pd.kind === 'react') Object.assign(pub, { actor: pd.play.actor, card: pd.play.card, as: pd.play.as, text: this.describePlay(pd.play) });
        if (pd.kind === 'event' || pd.kind === 'merchant' || pd.kind === 'plague') Object.assign(pub, { card: pd.card, drawer: pd.drawer });
        if (pd.kind === 'arrange') pub.actor = pd.player;
        view.pending = pub;
      }
      if (!me) return view;

      const myTurn = this.activePlayer === me && !pd && this.phase === 'play';
      view.hand = me.hand.map((c) => ({ ...c, options: myTurn ? this.optionsFor(me, c) : [] }));

      if (pd && pd.kind === 'react' && pd.eligible.includes(me.id) && !pd.passed.includes(me.id)) {
        view.prompt = { kind: 'react', options: this.reactCardsFor(me, pd.play) };
      } else if (pd && pd.kind === 'event' && pd.eligible.includes(me.id) && !pd.passed.includes(me.id)) {
        view.prompt = {
          kind: 'event',
          options: me.hand.filter((c) => c.key === 'flop_boat' || c.key === 'cricket_song')
            .map((c) => ({ cardId: c.id, label: c.key === 'flop_boat' ? 'Flop Boat: send it back into the deck' : 'Cricket Song as Flop Boat' })),
        };
      } else if (pd && pd.kind === 'plague' && pd.eligible.includes(me.id) && !pd.passed.includes(me.id)) {
        view.prompt = {
          kind: 'plague',
          options: me.hand.filter((c) => c.key === 'age_old_cure' || c.key === 'cricket_song')
            .map((c) => ({ cardId: c.id, label: c.key === 'age_old_cure' ? 'Age-Old Cure: protect your hand' : 'Cricket Song as Age-Old Cure' })),
        };
      } else if (pd && pd.kind === 'merchant' && pd.waiting.includes(me.id)) {
        view.prompt = { kind: 'merchant' };
      } else if (pd && pd.kind === 'arrange' && pd.player === me.id) {
        view.prompt = { kind: 'arrange', cards: pd.cards };
      } else if (!pd && this.activePlayer === me && this.phase === 'draw') {
        view.prompt = { kind: 'draw', canSkip: !me.skippedLast };
      } else if (!pd && this.activePlayer === me && this.phase === 'discard') {
        view.prompt = { kind: 'discard', count: me.hand.length - HAND_LIMIT };
      }
      return view;
    }
  }

  return { Game, HAND_LIMIT, shuffle };
});

/* GUBS Online browser client */
(() => {
  const { CARDS, TYPE_LABEL } = window.GUBS_CARDS;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  let ws = null;
  let room = null;
  let me = null; // my player id
  let view = null;
  let clockOffset = 0;
  let targeting = null; // { card, opt, selected: [] }
  let picked = new Set(); // hand cards picked for discarding
  let modalKey = null;
  let arrangeOrder = null;
  let lastLogLen = 0;

  // ---------- connection ----------
  function connect(onOpen) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = onOpen;
    ws.onmessage = (e) => handle(JSON.parse(e.data));
    ws.onclose = () => {
      const sess = store.get('gubs.session');
      if (room && sess) {
        toast('Connection lost. Reconnecting…', true);
        setTimeout(() => connect(() => send({ t: 'join', code: sess.code, token: sess.token })), 1500);
      }
    };
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function act(action) { send({ t: 'action', action }); }

  function handle(m) {
    if (m.t === 'joined') {
      if (m.token) store.set('gubs.session', { code: m.code, token: m.token });
      history.replaceState(null, '', `?room=${m.code}`);
    } else if (m.t === 'room') {
      room = m.room; me = m.you;
      if (!room.started) view = null;
      render();
    } else if (m.t === 'state') {
      clockOffset = m.now - Date.now();
      const prev = view;
      view = m.view;
      if (targeting && !(view.hand || []).some((c) => c.id === targeting.card.id)) targeting = null;
      if (!view.prompt || view.prompt.kind !== 'discard') picked.clear();
      if (prev && prev.version !== view.version && targeting) {
        // Re-validate targets after the board changed.
        const card = view.hand.find((c) => c.id === targeting.card.id);
        const opt = card && card.options.find((o) => o.mode === targeting.opt.mode && (o.as || null) === (targeting.opt.as || null));
        targeting = opt ? { card, opt, selected: targeting.selected.filter((t) => opt.targets.includes(t)) } : null;
      }
      render();
    } else if (m.t === 'error') {
      toast(m.msg, true);
    } else if (m.t === 'chat') {
      const el = $('#chat');
      el.insertAdjacentHTML('beforeend', `<div><b>${esc(m.from)}:</b> ${esc(m.text)}</div>`);
      el.scrollTop = el.scrollHeight;
      if (!$('#side').classList.contains('open')) toast(`${m.from}: ${m.text}`);
    } else if (m.t === 'kicked') {
      store.set('gubs.session', null);
      room = null; view = null;
      history.replaceState(null, '', location.pathname);
      toast('You were removed from the table.', true);
      render();
    }
  }

  // ---------- helpers ----------
  function cardEl(card, extra = '') {
    const def = card && CARDS[card.key];
    if (!def) return `<div class="card empty ${extra}"></div>`;
    return `<div class="card ${extra}" data-key="${card.key}" title="${esc(def.name)}: ${esc(def.text)}">
      <div class="fallback">${esc(def.name)}</div>
      <img src="cards/${card.key}.jpg" alt="${esc(def.name)}" onerror="this.remove()"></div>`;
  }

  const playerById = (id) => view.players.find((p) => p.id === id);
  const nameOf = (id) => (playerById(id) || { name: '?' }).name;

  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? '' : ' info');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.className = 'toast'; }, 2800);
  }

  function zoom(cards) {
    const z = $('#zoom');
    z.innerHTML = `<div class="zoom-wrap">${cards.map((c) => cardEl(c)).join('')}</div>`;
    z.classList.remove('hidden');
  }
  $('#zoom').onclick = () => $('#zoom').classList.add('hidden');

  function openModal(key, html) {
    if (modalKey === key) return;
    modalKey = key;
    $('#modalBox').innerHTML = html;
    $('#modal').classList.remove('hidden');
  }
  function closeModal() { modalKey = null; $('#modal').classList.add('hidden'); }

  function timerBar(deadline, total) {
    return `<div class="timer" data-deadline="${deadline}" data-total="${total}"><i></i></div>`;
  }
  setInterval(() => {
    document.querySelectorAll('.timer').forEach((el) => {
      const left = Number(el.dataset.deadline) - (Date.now() + clockOffset);
      el.firstChild.style.width = Math.max(0, Math.min(100, (left / Number(el.dataset.total)) * 100)) + '%';
    });
  }, 250);

  // ---------- rendering ----------
  function render() {
    $('#home').classList.toggle('hidden', !!room);
    $('#lobby').classList.toggle('hidden', !room || room.started);
    $('#table').classList.toggle('hidden', !room || !room.started || !view);
    if (room && !room.started) renderLobby();
    if (room && room.started && view) renderTable();
    if (!room) closeModal();
  }

  function renderLobby() {
    $('#lobbyCode').textContent = room.code;
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    $('#shareLink').textContent = link;
    $('#shareLink').href = link;
    const host = room.hostId === me;
    $('#seatList').innerHTML = room.seats.map((s) => `<li>
      <span class="dot ${s.connected ? '' : 'off'}"></span>
      <span class="who">${esc(s.name)}${s.id === me ? ' (you)' : ''}</span>
      ${s.id === room.hostId ? '<span class="tag">HOST</span>' : ''}
      ${host && s.id !== me ? `<button class="btn small danger" data-kick="${s.id}">Remove</button>` : ''}
    </li>`).join('');
    $('#addBotBtn').classList.toggle('hidden', !host);
    $('#startBtn').classList.toggle('hidden', !host);
    $('#addBotBtn').disabled = room.seats.length >= 6;
    $('#startBtn').disabled = room.seats.length < 2;
    $('#lobbyNote').textContent = !me ? 'You are spectating.'
      : host ? `${room.seats.length}/6 players. You need at least 2 (add bots to play solo).`
        : 'Waiting for the host to start the game…';
  }

  function stackEl(s, ownerId) {
    const targetable = targeting && targeting.opt.target.startsWith('stack') && targeting.opt.targets.includes(s.id);
    const selected = targeting && targeting.selected.includes(s.id);
    const cls = `stack ${s.kind === 'ring' ? 'ring' : ''} ${targetable ? 'targetable' : ''} ${selected ? 'selected' : ''}`;
    if (s.kind === 'ring') {
      const gubs = s.gubs.map((g, i) => cardEl(g, 'ringgub').replace('class="card', `style="--i:${i + 1}" class="card`)).join('');
      return `<div class="${cls}" style="--n:${s.gubs.length}" data-stack="${s.id}" data-owner="${ownerId}">${cardEl(s.ring)}${gubs}
        <span class="stack-tag tag-trapped">${s.gubs.length} trapped</span></div>`;
    }
    const tag = s.elder ? '<span class="stack-tag tag-elder">Elder</span>' : `<span class="stack-tag tag-${s.state}">${s.state}</span>`;
    const over = s.barricade || s.spout ? 'has-over' : '';
    return `<div class="${cls} ${over}" data-stack="${s.id}" data-owner="${ownerId}">${cardEl(s.gub)}${s.barricade ? cardEl(s.barricade, 'over-barricade') : ''}${s.spout ? cardEl(s.spout, 'over-spout') : ''}${tag}</div>`;
  }

  // Each player gets a Gub avatar tinted in their own colour.
  const avatarEl = (p) => {
    const i = view.players.findIndex((x) => x.id === p.id);
    return `<span class="avatar" style="--hue:${(i * 67) % 360}deg"></span>`;
  };

  // Nameplate: avatar, name, cards in hand and Gubs scored.
  function plateEl(p, extra = '') {
    const targetable = targeting && targeting.opt.target === 'player' && targeting.opt.targets.includes(p.id);
    const backs = Array.from({ length: Math.min(p.handCount, 8) }, (_, i) => `<span class="mini-back" style="--i:${i}"></span>`).join('');
    return `<div class="plate ${extra} ${view.active === p.id ? 'active' : ''} ${targetable ? 'targetable' : ''}" data-player="${p.id}">
      ${avatarEl(p)}
      <div class="plate-info">
        <span class="nm">${esc(p.name)}${p.id === me ? ' (you)' : ''}</span>
        <span class="counters">
          <span class="ctr" title="Cards in hand"><span class="mini-back"></span>${p.handCount}</span>
          <span class="ctr score" title="Free + Protected Gubs">${p.score} Gub${p.score === 1 ? '' : 's'}</span>
        </span>
      </div>
      ${extra === 'opp' ? `<div class="backs">${backs}</div>` : ''}
    </div>`;
  }

  // A player's area on the playmat.
  function zoneEl(p) {
    const targetable = targeting && targeting.opt.target === 'player' && targeting.opt.targets.includes(p.id);
    const field = p.field.length ? p.field.map((s) => stackEl(s, p.id)).join('') : '<span class="empty-field">No cards in play</span>';
    return `<div class="zone ${view.active === p.id ? 'active' : ''} ${targetable ? 'targetable' : ''}" data-player="${p.id}">
      <span class="zone-tab">${esc(p.id === me ? 'Your side' : p.name)} <b>${p.score}</b></span>
      <div class="field-row">${field}</div>
    </div>`;
  }

  function renderTable() {
    $('#tableCode').textContent = room.code;
    $('#letters').innerHTML = ['G', 'U', 'B'].map((L) => `<div class="letter ${view.letters.some((c) => CARDS[c.key].name === L) ? 'on' : ''}">${L}</div>`).join('');
    const active = playerById(view.active);
    $('#turnInfo').innerHTML = view.phase === 'over' ? '<b>Game over</b>'
      : `Turn ${view.turn} · <b>${view.active === me ? 'Your' : esc(active.name) + "'s"}</b> turn`;

    const idx = view.players.findIndex((p) => p.id === me);
    const others = idx < 0 ? view.players : [...view.players.slice(idx + 1), ...view.players.slice(0, idx)];
    $('#opponents').innerHTML = others.map((p) => plateEl(p, 'opp')).join('');
    $('#oppZones').style.setProperty('--n', others.length);
    $('#oppZones').innerHTML = others.map(zoneEl).join('');
    const mine = playerById(me);
    $('#me').innerHTML = mine ? zoneEl(mine) : '<p class="muted">Spectating</p>';
    $('#myPlate').innerHTML = mine ? plateEl(mine, 'mine') : '';

    $('#deckCount').textContent = view.deckCount;
    $('#discardCount').textContent = view.discardCount;
    const top = view.discard[view.discard.length - 1];
    $('#discardTop').outerHTML = top ? cardEl(top).replace('class="card ', 'id="discardTop" class="card ') : '<div id="discardTop" class="card empty"></div>';

    renderBanner();
    renderControls();
    renderHand();
    renderLog();
    renderSpotlight();
    renderModals();
  }

  // Big card + title sweep whenever a card is played, cancelled or drawn as an Event.
  // Actions are queued so each one is seen; if play runs ahead, only the latest few are kept.
  let spotSeq = null;
  const spotQueue = [];
  let spotBusy = false;
  function renderSpotlight() {
    const a = view.lastAction;
    if (spotSeq === null) { spotSeq = a ? a.seq : 0; return; } // don't replay old actions on (re)connect
    if (!a || a.seq <= spotSeq) return;
    spotSeq = a.seq;
    spotQueue.push(a);
    if (spotQueue.length > 2) spotQueue.shift();
    if (!spotBusy) nextSpotlight();
  }
  function nextSpotlight() {
    const el = $('#spotlight');
    const a = spotQueue.shift();
    if (!a) { spotBusy = false; el.classList.remove('show'); return; }
    spotBusy = true;
    const who = a.actor === me ? 'You' : nameOf(a.actor);
    el.innerHTML = `<div class="spot-card">${cardEl(a.card)}</div>
      <div class="spot-banner"><span class="spot-who">${esc(who)}</span><span class="spot-title">${esc(a.label)}</span></div>`;
    el.classList.remove('show');
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
    clearTimeout(nextSpotlight.h);
    nextSpotlight.h = setTimeout(nextSpotlight, 1700);
  }

  function renderBanner() {
    const pd = view.pending;
    let html = '';
    if (view.phase === 'over') html = '<span class="big">G-U-B!</span>The final letter has been drawn.';
    else if (targeting) {
      const o = targeting.opt;
      const what = o.target === 'player' ? 'a player' : o.target === 'stacks' ? (o.count ? `${o.count} Gub(s)` : 'stacks on your side') : 'a target';
      html = `<span class="big">${esc(CARDS[targeting.card.key].name)}</span>${esc(o.label)}<br>Choose ${what} on the table.`;
    } else if (pd) {
      const card = pd.card ? CARDS[pd.card.key].name : '';
      const total = pd.kind === 'merchant' || pd.kind === 'plague' ? 30000 : pd.kind === 'arrange' ? 60000 : 20000;
      if (pd.kind === 'react') html = `<span class="big">${esc(nameOf(pd.actor))} plays ${esc(card)}</span>${esc(pd.text)}<br><span class="muted">Waiting for Interrupts…</span>`;
      else if (pd.kind === 'event') html = `<span class="big">Event: ${esc(card)}</span>${esc(CARDS[pd.card.key].text)}<br><span class="muted">Anyone with a Flop Boat may stop it…</span>`;
      else if (pd.kind === 'merchant') html = `<span class="big">Traveling Merchant</span>Everyone chooses one card to keep. Waiting on ${pd.waitingOn.map(nameOf).map(esc).join(', ')}.`;
      else if (pd.kind === 'plague') html = '<span class="big">Gargok Plague</span>Players with an Age-Old Cure may protect their hand…';
      else if (pd.kind === 'arrange') html = `<span class="big">Scout</span>${esc(nameOf(pd.actor))} is rearranging the top of the deck.`;
      html += timerBar(pd.deadline, total);
    } else if (view.active === me) {
      html = view.phase === 'draw' ? '<span class="big">Your turn</span>Draw a card, or skip drawing.'
        : view.phase === 'discard' ? `<span class="big">Too many cards</span>Discard down to ${view.handLimit}.`
          : '<span class="big">Your turn</span>Click a glowing card in your hand to play it, then say "Go".';
    } else {
      html = `<span class="big">${esc(nameOf(view.active))}</span>${view.phase === 'draw' ? 'is deciding whether to draw…' : 'is playing…'}`;
    }
    $('#banner').innerHTML = html;
  }

  function renderControls() {
    const c = $('#controls');
    const pr = view.prompt;
    let html = '';
    if (targeting) {
      if (targeting.opt.target === 'stacks') {
        const need = targeting.opt.count;
        const n = targeting.selected.length;
        html += `<button class="btn gold" data-ctl="confirmTargets" ${need ? (n === need ? '' : 'disabled') : (n ? '' : 'disabled')}>Confirm (${n}${need ? '/' + need : ''})</button>`;
      }
      html += '<button class="btn" data-ctl="cancelTarget">Cancel</button>';
    } else if (pr && pr.kind === 'draw') {
      html = `<button class="btn gold" data-ctl="draw">Draw a card</button><button class="btn" data-ctl="skipDraw" ${pr.canSkip ? '' : 'disabled title="You can\'t skip two turns in a row"'}>Don't draw</button>`;
    } else if (pr && pr.kind === 'discard') {
      html = `<span class="muted">Select ${pr.count} card(s) to discard</span><button class="btn gold" data-ctl="discard" ${picked.size === pr.count ? '' : 'disabled'}>Discard (${picked.size}/${pr.count})</button>`;
    } else if (pr && pr.kind === 'merchant') {
      html = '<span class="muted">Click the one card you want to <b>keep</b>. The rest go to the player on your right.</span>';
    } else if (view.active === me && view.phase === 'play' && !view.pending) {
      html = '<button class="btn gold" data-ctl="endTurn">End turn ("Go!")</button>';
    }
    c.innerHTML = html;
  }

  function renderHand() {
    const pr = view.prompt;
    $('#hand').innerHTML = (view.hand || []).map((card) => {
      let cls = '';
      if (pr && pr.kind === 'discard') cls = picked.has(card.id) ? 'picked' : '';
      else if (pr && pr.kind === 'merchant') cls = 'playable';
      else if (card.options.length) cls = 'playable';
      else if (view.active === me && view.phase === 'play') cls = 'dim';
      if (targeting && targeting.card.id === card.id) cls = 'picked';
      return cardEl(card, cls).replace('class="card', `data-hand="${card.id}" class="card`);
    }).join('');
  }

  function renderLog() {
    const el = $('#log');
    if (view.log.length === lastLogLen && el.children.length) return;
    lastLogLen = view.log.length;
    el.innerHTML = view.log.map((l) => `<li>${esc(l.text)}</li>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  function renderModals() {
    const pr = view.prompt;
    const pd = view.pending;
    if (view.result) {
      const r = view.result;
      const rows = [...r.rows].sort((a, b) => b.score - a.score);
      openModal('result' + view.version, `<h3>${r.winners.includes(me) ? 'You win!' : esc(r.winners.map(nameOf).join(' & ')) + ' win' + (r.winners.length > 1 ? '' : 's') + '!'}</h3>
        <p class="muted">${esc(r.reason)}</p>
        <table class="scores"><tr><th>Player</th><th>Gubs</th><th>Elder</th><th>Hand</th></tr>
        ${rows.map((x) => `<tr class="${r.winners.includes(x.id) ? 'win' : ''}"><td>${esc(x.name)}</td><td>${x.score}</td><td>${x.elder ? '★' : ''}</td><td>${x.hand}</td></tr>`).join('')}</table>
        <div class="opts">${room.hostId === me ? '<button class="btn gold" data-ctl="rematch">Play again</button>' : '<p class="muted">Waiting for the host to start a rematch…</p>'}
        <button class="btn" data-ctl="closeModal">Look at the table</button></div>`);
      return;
    }
    if (view.reveal) {
      openModal('reveal' + view.reveal.title, `<h3>Scout: ${esc(view.reveal.title)}</h3>
        <div class="cards">${view.reveal.cards.length ? view.reveal.cards.map((c) => cardEl(c)).join('') : '<p class="muted">Empty hand.</p>'}</div>
        <div class="opts"><button class="btn gold" data-ctl="dismiss">Got it</button></div>`);
      return;
    }
    if (pr && (pr.kind === 'react' || pr.kind === 'event' || pr.kind === 'plague')) {
      const card = pd.card;
      const title = pr.kind === 'react' ? `${esc(nameOf(pd.actor))} plays ${esc(CARDS[card.key].name)}!`
        : pr.kind === 'event' ? `Event: ${esc(CARDS[card.key].name)}` : 'Gargok Plague!';
      const body = pr.kind === 'react' ? esc(pd.text) : esc(CARDS[card.key].text);
      const passLabel = pr.kind === 'plague' ? 'Lose my hand' : 'Let it happen';
      openModal(`prompt-${pr.kind}-${card.id}`, `<h3>${title}</h3><p>${body}</p>
        <div class="cards">${cardEl(card)}</div>
        ${timerBar(pd.deadline, pr.kind === 'plague' ? 30000 : 20000)}
        <div class="opts">${pr.options.map((o) => `<button class="btn gold" data-respond="${pr.kind}" data-card="${o.cardId}">${esc(o.label)}</button>`).join('')}
        <button class="btn" data-ctl="pass">${passLabel}</button></div>`);
      return;
    }
    if (pr && pr.kind === 'arrange') {
      if (!arrangeOrder || arrangeOrder.length !== pr.cards.length || !pr.cards.every((c) => arrangeOrder.includes(c.id))) arrangeOrder = pr.cards.map((c) => c.id);
      const html = `<h3>Scout: rearrange the deck</h3><p class="muted">Leftmost card will be drawn first. Click a card to move it left.</p>
        <div class="cards arrange">${arrangeOrder.map((id, i) => `<div class="slot" data-arr="${i}">${cardEl(pr.cards.find((c) => c.id === id))}<span>${i === 0 ? 'Top' : '#' + (i + 1)}</span></div>`).join('')}</div>
        <div class="opts"><button class="btn gold" data-ctl="arrange">Put them back</button></div>`;
      modalKey = null;
      openModal('arrange', html);
      return;
    }
    if (modalKey && (modalKey.startsWith('prompt') || modalKey === 'arrange' || modalKey.startsWith('reveal') || modalKey.startsWith('result'))) closeModal();
    if (modalKey === 'menu' && !(view.active === me && view.phase === 'play' && !view.pending)) closeModal();
  }

  function openCardMenu(card) {
    const def = CARDS[card.key];
    const opts = card.options;
    modalKey = null;
    openModal('menu', `<div class="menu-top">${cardEl(card)}<div>
      <h3>${esc(def.name)}</h3><span class="type-pill">${esc(TYPE_LABEL[def.type])}</span><p>${esc(def.text)}</p></div></div>
      <div class="opts">${opts.map((o, i) => `<button class="btn gold" data-opt="${i}" data-card="${card.id}">${esc(o.label)}</button>`).join('')}
      ${opts.length ? '' : '<p class="muted">This card can\'t be played right now.</p>'}
      <button class="btn" data-ctl="closeModal">Close</button></div>`);
  }

  function choose(card, opt) {
    closeModal();
    if (opt.target === 'none') { act({ type: 'play', cardId: card.id, mode: opt.mode, as: opt.as || null, targets: [] }); return; }
    targeting = { card, opt, selected: [] };
    render();
  }

  function sendTargets() {
    const { card, opt, selected } = targeting;
    act({ type: 'play', cardId: card.id, mode: opt.mode, as: opt.as || null, targets: selected });
    targeting = null;
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const t = e.target;
    const ctl = t.closest('[data-ctl]');
    if (ctl) {
      const k = ctl.dataset.ctl;
      if (k === 'draw') act({ type: 'draw' });
      else if (k === 'skipDraw') act({ type: 'skipDraw' });
      else if (k === 'endTurn') act({ type: 'endTurn' });
      else if (k === 'discard') act({ type: 'discard', cardIds: [...picked] });
      else if (k === 'pass') { act({ type: 'pass' }); closeModal(); }
      else if (k === 'dismiss') { act({ type: 'dismiss' }); closeModal(); }
      else if (k === 'rematch') { send({ t: 'rematch' }); closeModal(); }
      else if (k === 'arrange') { act({ type: 'arrange', order: arrangeOrder }); arrangeOrder = null; closeModal(); }
      else if (k === 'closeModal') closeModal();
      else if (k === 'cancelTarget') { targeting = null; render(); }
      else if (k === 'confirmTargets') sendTargets();
      return;
    }
    const resp = t.closest('[data-respond]');
    if (resp) {
      const kind = resp.dataset.respond;
      act({ type: kind === 'plague' ? 'cure' : 'react', cardId: resp.dataset.card });
      closeModal();
      return;
    }
    const optBtn = t.closest('[data-opt]');
    if (optBtn) {
      const card = view.hand.find((c) => c.id === optBtn.dataset.card);
      if (card) choose(card, card.options[Number(optBtn.dataset.opt)]);
      return;
    }
    const arr = t.closest('[data-arr]');
    if (arr) {
      const i = Number(arr.dataset.arr);
      if (i > 0) [arrangeOrder[i - 1], arrangeOrder[i]] = [arrangeOrder[i], arrangeOrder[i - 1]];
      modalKey = null;
      renderModals();
      return;
    }
    const handCard = t.closest('[data-hand]');
    if (handCard && view) {
      const card = view.hand.find((c) => c.id === handCard.dataset.hand);
      const pr = view.prompt;
      if (pr && pr.kind === 'discard') {
        if (picked.has(card.id)) picked.delete(card.id); else if (picked.size < pr.count) picked.add(card.id);
        render();
      } else if (pr && pr.kind === 'merchant') {
        act({ type: 'keep', cardId: card.id });
      } else if (targeting) {
        targeting = null; render();
      } else if (card.options.length) {
        openCardMenu(card);
      } else {
        zoom([card]);
      }
      return;
    }
    const stack = t.closest('[data-stack]');
    if (stack && view) {
      const id = stack.dataset.stack;
      if (targeting && targeting.opt.target.startsWith('stack') && targeting.opt.targets.includes(id)) {
        if (targeting.opt.target === 'stack') { targeting.selected = [id]; sendTargets(); return; }
        const sel = targeting.selected;
        if (sel.includes(id)) sel.splice(sel.indexOf(id), 1);
        else if (!targeting.opt.count || sel.length < targeting.opt.count) sel.push(id);
        render();
        return;
      }
      const owner = playerById(stack.dataset.owner);
      const s = owner && owner.field.find((x) => x.id === id);
      if (s) zoom(s.kind === 'ring' ? [s.ring, ...s.gubs] : [s.gub, s.barricade, s.spout].filter(Boolean));
      return;
    }
    const seat = t.closest('[data-player]');
    if (seat && targeting && targeting.opt.target === 'player' && targeting.opt.targets.includes(seat.dataset.player)) {
      targeting.selected = [seat.dataset.player];
      sendTargets();
      return;
    }
    const kick = t.closest('[data-kick]');
    if (kick) send({ t: 'kick', id: kick.dataset.kick });
    if (t.closest('#discardTop') && view && view.discard.length) zoom([...view.discard].reverse());
    const g = t.closest('.gallery .card');
    if (g) zoom([{ key: g.dataset.key }]);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#zoom').classList.contains('hidden')) $('#zoom').classList.add('hidden');
      else if (targeting) { targeting = null; render(); } else if (modalKey === 'menu') closeModal();
    }
  });

  const nameInput = $('#name');
  nameInput.value = store.get('gubs.name') || '';
  const myName = () => { const n = nameInput.value.trim() || 'Gub Keeper'; store.set('gubs.name', n); return n; };

  $('#createBtn').onclick = () => send({ t: 'create', name: myName() });
  $('#joinBtn').onclick = () => {
    const code = $('#codeInput').value.trim().toUpperCase();
    if (code.length !== 4) return toast('Enter the 4-letter table code', true);
    const sess = store.get('gubs.session');
    send({ t: 'join', code, name: myName(), token: sess && sess.code === code ? sess.token : null });
  };
  $('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#joinBtn').click(); });
  $('#addBotBtn').onclick = () => send({ t: 'addBot' });
  $('#startBtn').onclick = () => send({ t: 'start' });
  $('#copyBtn').onclick = async () => {
    try { await navigator.clipboard.writeText($('#shareLink').href); toast('Link copied!'); } catch { toast('Copy failed. Select the link instead.', true); }
  };
  $('#sideToggle').onclick = () => $('#side').classList.toggle('open');
  $('#sideClose').onclick = () => $('#side').classList.remove('open');
  $('#spotlight').onclick = () => { clearTimeout(nextSpotlight.h); nextSpotlight(); };
  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#chatInput').value.trim();
    if (v) send({ t: 'chat', text: v });
    $('#chatInput').value = '';
  };

  // Rules summary on the home screen.
  const guide = Object.entries(CARDS).filter(([, d]) => d.type !== 'letter')
    .map(([, d]) => `<li><b>${esc(d.name)}</b> (${esc(TYPE_LABEL[d.type])}, ×${d.count}): ${esc(d.text)}</li>`).join('');
  $('#rulesText').innerHTML = `
    <h4>Goal</h4><p>Have the most Free and/or Protected Gubs in play when the final letter of G-U-B is drawn from the deck.</p>
    <h4>Setup</h4><p>Everyone starts with one Gub in play. The G, U and B cards are hidden near the top, middle and bottom of the deck. Everyone is dealt 3 cards (Events are replaced).</p>
    <h4>Your turn</h4><p><b>Draw</b> one card, or choose not to (never two turns in a row). Then <b>play</b> as many cards as you like, then <b>discard</b> down to 8 and say "Go!".</p>
    <h4>Card types</h4><p><b>Barricades</b> protect a Gub from Lures. <b>Traps</b> trap Free Gubs (trapped Gubs don't score). <b>Hazards</b> attack. <b>Tools</b> help. <b>Interrupts</b> are played on anyone's turn, the moment something happens. <b>Events</b> happen as soon as they are drawn, then you draw again; so do Letters.</p>
    <h4>End</h4><p>When the third letter is drawn the game ends at once. Ties go to the Esteemed Elder, then to whoever holds the fewest cards.</p>
    <h4>The cards</h4><div class="gallery">${Object.keys(CARDS).map((key) => cardEl({ key })).join('')}</div>
    <h4>Card guide</h4><ul class="guide">${guide}</ul>`;

  // Start: connect and rejoin a table from the URL if we have one.
  connect(() => {
    const code = new URLSearchParams(location.search).get('room');
    if (!code) return;
    const sess = store.get('gubs.session');
    if (sess && sess.code === code.toUpperCase()) send({ t: 'join', code: sess.code, token: sess.token });
    else { $('#codeInput').value = code.toUpperCase(); nameInput.focus(); toast('Enter your name and press Join table.'); }
  });
})();

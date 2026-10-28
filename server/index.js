// HTTP static server + WebSocket game rooms.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game } = require('./engine');
const { decide } = require('./bot');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const STATIC = { '/shared/': path.join(ROOT, 'shared'), '/': path.join(ROOT, 'public') };
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS) || 1400; // pause between bot moves so humans can follow along
const IDLE_TAKEOVER_MS = 45000; // a disconnected player's turn is played by a bot after this long
const BOT_NAMES = ['Mossy', 'Pip', 'Bramble', 'Toadstool', 'Fennel', 'Nib', 'Clover', 'Sprig'];

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const prefix = url.startsWith('/shared/') ? '/shared/' : '/';
  const base = STATIC[prefix];
  let file = path.normalize(path.join(base, url.slice(prefix.length)));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  if (url === '/' || url === '') file = path.join(base, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const rooms = new Map();
const id = (n = 8) => crypto.randomBytes(n).toString('hex');

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
    if (!rooms.has(c)) return c;
  }
}

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function roomInfo(room) {
  return {
    code: room.code, hostId: room.hostId, started: !!room.game,
    seats: room.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot, connected: s.isBot || !!s.ws })),
  };
}

function broadcast(room) {
  const info = roomInfo(room);
  const targets = [...room.seats.filter((s) => s.ws).map((s) => ({ ws: s.ws, pid: s.id })), ...[...room.spectators].map((ws) => ({ ws, pid: null }))];
  for (const { ws, pid } of targets) {
    send(ws, { t: 'room', room: info, you: pid });
    if (room.game) send(ws, { t: 'state', view: room.game.viewFor(pid), now: Date.now() });
  }
}

function startGame(room) {
  room.game = new Game(room.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })));
  room.lastBot = 0;
  for (const s of room.seats) s.idleSince = s.ws || s.isBot ? null : Date.now();
}

// Drives timers, bots, and disconnected players.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const g = room.game;
    const humansOnline = room.seats.some((s) => !s.isBot && s.ws) || room.spectators.size;
    if (!humansOnline) {
      if (now - room.touched > 30 * 60 * 1000) rooms.delete(room.code);
      continue;
    }
    room.touched = now;
    if (!g) {
      // A lobby seat whose player has been gone a while is freed; the host role moves on.
      const gone = room.seats.filter((s) => !s.isBot && !s.ws && now - s.idleSince > 20000);
      if (gone.length) {
        room.seats = room.seats.filter((s) => !gone.includes(s));
        if (!room.seats.some((s) => s.id === room.hostId)) {
          const next = room.seats.find((s) => !s.isBot && s.ws);
          room.hostId = next ? next.id : null;
        }
        broadcast(room);
      }
      continue;
    }
    if (g.phase === 'over') continue;
    let changed = g.tick();
    if (now - room.lastBot >= BOT_DELAY_MS) {
      for (const pid of g.waitingOn()) {
        const seat = room.seats.find((s) => s.id === pid);
        const auto = seat.isBot || (!seat.ws && seat.idleSince && now - seat.idleSince > IDLE_TAKEOVER_MS);
        if (!auto) continue;
        const action = decide(g, pid);
        if (!action) continue;
        try { g.act(pid, action); changed = true; } catch (e) { console.error('bot error', e.message, action); }
        room.lastBot = now;
        break;
      }
    }
    if (changed) broadcast(room);
  }
}, 250);

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  let room = null;
  let seat = null;

  const fail = (msg) => send(ws, { t: 'error', msg });
  const isHost = () => room && seat && room.hostId === seat.id;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const name = String(m.name || '').trim().slice(0, 16) || 'Gub Keeper';
    try {
      switch (m.t) {
        case 'create': {
          const code = newCode();
          room = { code, seats: [], spectators: new Set(), game: null, hostId: null, touched: Date.now(), lastBot: 0 };
          rooms.set(code, room);
          seat = { id: id(), token: id(16), name, isBot: false, ws };
          room.seats.push(seat);
          room.hostId = seat.id;
          send(ws, { t: 'joined', code, token: seat.token, playerId: seat.id });
          break;
        }
        case 'join': {
          const r = rooms.get(String(m.code || '').toUpperCase());
          if (!r) return fail('Room not found');
          room = r;
          const existing = m.token && r.seats.find((s) => s.token === m.token);
          if (existing) {
            if (existing.ws && existing.ws !== ws) send(existing.ws, { t: 'error', msg: 'Opened in another tab' });
            seat = existing;
            seat.ws = ws;
            seat.idleSince = null;
          } else if (!r.game && r.seats.length < 6) {
            seat = { id: id(), token: id(16), name, isBot: false, ws };
            r.seats.push(seat);
          } else {
            r.spectators.add(ws);
            send(ws, { t: 'joined', code: r.code, spectator: true });
            break;
          }
          send(ws, { t: 'joined', code: r.code, token: seat.token, playerId: seat.id });
          break;
        }
        case 'addBot': {
          if (!isHost() || room.game) return fail('Only the host can add bots before the game starts');
          if (room.seats.length >= 6) return fail('The table is full (6 players)');
          const used = new Set(room.seats.map((s) => s.name));
          const bn = BOT_NAMES.find((b) => !used.has(b + ' (bot)')) || 'Bot';
          room.seats.push({ id: id(), token: null, name: bn + ' (bot)', isBot: true, ws: null });
          break;
        }
        case 'kick': {
          if (!isHost() || room.game) return fail('Only the host can remove players before the game starts');
          const s = room.seats.find((x) => x.id === m.id);
          if (!s || s === seat) return;
          room.seats = room.seats.filter((x) => x !== s);
          if (s.ws) send(s.ws, { t: 'kicked' });
          break;
        }
        case 'start':
        case 'rematch': {
          if (!isHost()) return fail('Only the host can start the game');
          if (m.t === 'start' && room.game) return;
          if (m.t === 'rematch' && (!room.game || room.game.phase !== 'over')) return;
          if (room.seats.length < 2) return fail('GUBS needs at least 2 players. Add a bot!');
          startGame(room);
          break;
        }
        case 'action': {
          if (!room || !room.game || !seat) return fail('No game in progress');
          room.game.act(seat.id, m.action || {});
          break;
        }
        case 'chat': {
          if (!room) return;
          const text = String(m.text || '').trim().slice(0, 200);
          if (!text) return;
          const from = seat ? seat.name : 'Spectator';
          for (const s of room.seats) send(s.ws, { t: 'chat', from, text });
          for (const w of room.spectators) send(w, { t: 'chat', from, text });
          return;
        }
        default:
          return;
      }
    } catch (e) {
      fail(e.message);
    }
    if (room) broadcast(room);
  });

  ws.on('close', () => {
    if (!room) return;
    room.spectators.delete(ws);
    if (seat && seat.ws === ws) {
      seat.ws = null;
      seat.idleSince = Date.now();
    }
    broadcast(room);
  });
});

server.listen(PORT, () => console.log(`GUBS online running at http://localhost:${PORT}`));

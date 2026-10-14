// ===== StarCatch: авторитарный сервер комнат + игровой цикл =====
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname + '/public'));

// --- Константы игры ---
const W = 1000, H = 700;          // логическое поле (клиент масштабирует)
const PR = 20, SR = 12;           // радиусы игрока и звезды
const SPEED = 330;                // px/сек
const MAX_PLAYERS = 8, MIN_PLAYERS = 2;
const ROUND_SEC = 60, STARS = 5, TICK_MS = 33;
const OR = 28, OBST = 3, OSPEED = 150;            // препятствия
const BOOST_MS = 4000, BOOST_K = 1.6, BONUS_EVERY = 8000; // ускорители
const STUN_MS = 1000, INV_MS = 2500;               // оглушение и неуязвимость после удара
const COLORS = ['#ff4d8d', '#4dd2ff', '#ffd24d', '#7dff6b', '#b07bff', '#ff8a3d', '#3dffc8', '#ff6b6b'];
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без O/0/I/1

const rooms = new Map(); // code -> room (хранилище в памяти)

// Уникальный читаемый код из 5 символов
function genCode() {
  let c;
  do { c = Array.from({ length: 5 }, () => ALPHA[Math.random() * ALPHA.length | 0]).join(''); }
  while (rooms.has(c));
  return c;
}
const rnd = (a, b) => a + Math.random() * (b - a);

// Публичное представление комнаты (лобби)
const pub = r => ({
  code: r.code, host: r.host, state: r.state, min: MIN_PLAYERS, max: MAX_PLAYERS,
  players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, ready: p.ready, score: p.score }))
});
const sendRoom = r => io.to(r.code).emit('room', pub(r));

function addPlayer(socket, room, name) {
  const used = new Set([...room.players.values()].map(p => p.color));
  const color = COLORS.find(c => !used.has(c)) || COLORS[0];
  room.players.set(socket.id, {
    id: socket.id, name, color, ready: false, score: 0, boostUntil: 0, stunUntil: 0, invUntil: 0,
    x: rnd(PR, W - PR), y: rnd(PR, H - PR), ix: 0, iy: 0
  });
  socket.join(room.code);
  socket.data.code = room.code;
  sendRoom(room);
}

// Выход/отключение: передача хоста следующему, удаление пустой комнаты
function removePlayer(socket) {
  const room = rooms.get(socket.data.code);
  if (!room) return;
  room.players.delete(socket.id);
  socket.leave(room.code);
  socket.data.code = null;
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  if (room.host === socket.id) room.host = room.players.keys().next().value;
  if (room.state === 'playing' && room.players.size < 1) room.state = 'lobby';
  sendRoom(room);
}

const cleanName = n => String(n || '').replace(/[<>]/g, '').trim().slice(0, 12);

io.on('connection', socket => {
  socket.on('create', (name, cb) => {
    name = cleanName(name);
    if (!name) return cb({ error: 'Введите имя' });
    removePlayer(socket);
    const room = { code: genCode(), host: socket.id, state: 'lobby', players: new Map(), stars: [], endsAt: 0 };
    rooms.set(room.code, room);
    addPlayer(socket, room, name);
    cb({ ok: true, code: room.code });
  });

  socket.on('join', ({ code, name }, cb) => {
    name = cleanName(name);
    code = String(code || '').toUpperCase().trim();
    if (!name) return cb({ error: 'Введите имя' });
    const room = rooms.get(code);
    if (!room) return cb({ error: 'Комната не найдена' });
    if (room.players.size >= MAX_PLAYERS) return cb({ error: 'Комната заполнена' });
    if (room.state !== 'lobby') return cb({ error: 'Игра уже началась' });
    removePlayer(socket);
    addPlayer(socket, room, name);
    cb({ ok: true, code });
  });

  socket.on('ready', () => {
    const r = rooms.get(socket.data.code);
    const p = r && r.players.get(socket.id);
    if (p && r.state === 'lobby') { p.ready = !p.ready; sendRoom(r); }
  });

  // Старт — только хост и только при достаточном числе игроков
  socket.on('start', () => {
    const r = rooms.get(socket.data.code);
    if (!r || r.host !== socket.id || r.state !== 'lobby' || r.players.size < MIN_PLAYERS) return;
    r.state = 'playing'; r.stars = []; r.bonus = []; r.endsAt = Date.now() + ROUND_SEC * 1000;
    r.nextBonus = Date.now() + 4000;
    r.obst = Array.from({ length: OBST }, () => { const a = rnd(0, 6.28); return { x: rnd(OR, W - OR), y: rnd(OR, H - OR), vx: Math.cos(a) * OSPEED, vy: Math.sin(a) * OSPEED }; });
    r.players.forEach(p => { p.score = 0; p.boostUntil = p.stunUntil = p.invUntil = 0; p.x = rnd(PR, W - PR); p.y = rnd(PR, H - PR); p.ix = p.iy = 0; });
    io.to(r.code).emit('started', { W, H, PR, SR, OR });
    sendRoom(r);
  });

  // Клиент шлёт только направление (-1..1); позицию считает сервер
  socket.on('input', ({ x, y } = {}) => {
    const p = rooms.get(socket.data.code)?.players.get(socket.id);
    if (!p) return;
    x = +x || 0; y = +y || 0;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    p.ix = x; p.iy = y;
  });

  socket.on('leave', () => removePlayer(socket));
  socket.on('disconnect', () => removePlayer(socket));
});

// --- Игровой цикл (30 Гц): движение, звёзды, ускорители, препятствия ---
setInterval(() => {
  const dt = TICK_MS / 1000, now = Date.now();
  for (const r of rooms.values()) {
    if (r.state !== 'playing') continue;
    const fx = (t, id) => io.to(r.code).emit('fx', { t, id }); // события для звуков
    while (r.stars.length < STARS) r.stars.push({ x: rnd(SR, W - SR), y: rnd(SR, H - SR) });
    if (!r.bonus.length && now > r.nextBonus) { r.bonus.push({ x: rnd(30, W - 30), y: rnd(30, H - 30) }); r.nextBonus = now + BONUS_EVERY; }
    // Препятствия отскакивают от стен
    for (const o of r.obst) {
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < OR || o.x > W - OR) { o.vx *= -1; o.x = Math.min(W - OR, Math.max(OR, o.x)); }
      if (o.y < OR || o.y > H - OR) { o.vy *= -1; o.y = Math.min(H - OR, Math.max(OR, o.y)); }
    }
    for (const p of r.players.values()) {
      if (now >= p.stunUntil) { // оглушённый игрок не двигается
        const sp = SPEED * (now < p.boostUntil ? BOOST_K : 1) * dt;
        p.x = Math.min(W - PR, Math.max(PR, p.x + p.ix * sp));
        p.y = Math.min(H - PR, Math.max(PR, p.y + p.iy * sp));
      }
      r.stars = r.stars.filter(s => {
        if (Math.hypot(s.x - p.x, s.y - p.y) < PR + SR) { p.score++; fx('star', p.id); return false; }
        return true;
      });
      r.bonus = r.bonus.filter(bn => {
        if (Math.hypot(bn.x - p.x, bn.y - p.y) < PR + 16) { p.boostUntil = now + BOOST_MS; fx('boost', p.id); return false; }
        return true;
      });
      if (now >= p.invUntil && r.obst.some(o => Math.hypot(o.x - p.x, o.y - p.y) < PR + OR - 4)) {
        p.score = Math.max(0, p.score - 1); p.stunUntil = now + STUN_MS; p.invUntil = now + INV_MS; fx('hit', p.id);
      }
    }
    if (now >= r.endsAt) {
      const results = [...r.players.values()].map(p => ({ name: p.name, color: p.color, score: p.score })).sort((a, b) => b.score - a.score);
      r.state = 'lobby';
      r.players.forEach(p => { p.ready = false; p.ix = p.iy = 0; });
      io.to(r.code).emit('over', results);
      sendRoom(r);
    } else {
      io.to(r.code).emit('state', {
        t: Math.ceil((r.endsAt - now) / 1000),
        // флаги: 1 = ускорение, 2 = оглушён, 4 = неуязвим
        p: [...r.players.values()].map(p => [p.id, Math.round(p.x), Math.round(p.y), p.score,
          (now < p.boostUntil ? 1 : 0) | (now < p.stunUntil ? 2 : 0) | (now < p.invUntil ? 4 : 0)]),
        s: r.stars.map(s => [Math.round(s.x), Math.round(s.y)]),
        o: r.obst.map(o => [Math.round(o.x), Math.round(o.y)]),
        b: r.bonus.map(b => [Math.round(b.x), Math.round(b.y)])
      });
    }
  }
}, TICK_MS);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('StarCatch: http://localhost:' + PORT));

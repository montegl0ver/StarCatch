// ===== Клиент StarCatch =====
const $ = id => document.getElementById(id);
const socket = io();
let room = null, G = { W: 1000, H: 700, PR: 20, SR: 12 };
let stars = [], obst = [], bonus = [], pl = new Map(); // pl: id -> {x,y,rx,ry,score}
let input = { x: 0, y: 0 }, sent = { x: 0, y: 0 };

// --- Утилиты UI ---
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); $('joy').classList.toggle('on', id === 'game'); if (id === 'game') resize(); }
let tt; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400); }
const myName = () => { const n = $('name').value.trim(); if (n) localStorage.setItem('sc_name', n); return n; };
$('name').value = localStorage.getItem('sc_name') || '';
const urlCode = new URLSearchParams(location.search).get('room'); // ссылка-приглашение
if (urlCode) $('code').value = urlCode.toUpperCase();

// --- Меню ---
$('create').onclick = () => socket.emit('create', myName(), r => r.error ? toast(r.error) : null);
$('join').onclick = () => socket.emit('join', { code: $('code').value, name: myName() }, r => r.error ? toast(r.error) : null);
$('leaveLobby').onclick = $('leaveGame').onclick = () => { socket.emit('leave'); room = null; show('menu'); };

// --- Лобби ---
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); } catch { const i = document.createElement('input'); i.value = text; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
  toast(msg);
}
$('copyCode').onclick = () => copy(room.code, 'Код скопирован');
$('copyLink').onclick = () => copy(location.origin + '/?room=' + room.code, 'Ссылка скопирована');
$('ready').onclick = () => socket.emit('ready');
$('start').onclick = () => socket.emit('start');

// Сервер — источник истины: любое изменение комнаты приходит целиком
socket.on('room', r => {
  const was = room; room = r;
  if (r.state === 'lobby' && (!was || !$('lobby').classList.contains('active')) && !$('game').classList.contains('active')) show('lobby');
  $('roomCode').textContent = r.code;
  $('players').innerHTML = r.players.map(p => {
    const tag = p.id === r.host ? '<span class="tag host">Хост</span>' : p.ready ? '<span class="tag ready">Готов</span>' : '<span class="tag">Игрок</span>';
    return `<li><span class="ava" style="background:${p.color};color:${p.color}"><b style="color:#12102a">${p.name[0].toUpperCase()}</b></span><span class="name">${esc(p.name)}${p.id === socket.id ? ' (ты)' : ''}</span>${tag}</li>`;
  }).join('');
  const host = r.host === socket.id, enough = r.players.length >= r.min;
  $('start').style.display = host ? '' : 'none';
  $('start').disabled = !enough;
  $('ready').style.display = host ? 'none' : '';
  $('hint').textContent = enough ? (host ? 'Можно начинать' : 'Ждём хоста') : `Нужно минимум ${r.min} игрока (${r.players.length}/${r.min})`;
});
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// --- Игра ---
socket.on('started', g => { G = g; stars = []; obst = []; bonus = []; pl.clear(); $('results').innerHTML = ''; show('game'); sfx('start'); });
socket.on('state', s => {
  if ($('timer').textContent != s.t && s.t <= 5) sfx('tick');
  $('timer').textContent = s.t;
  stars = s.s; bonus = s.b;
  obst = s.o.map(([x, y], i) => ({ x, y, rx: obst[i] ? obst[i].rx : x, ry: obst[i] ? obst[i].ry : y }));
  s.p.forEach(([id, x, y, score, f]) => { const o = pl.get(id); if (o) Object.assign(o, { x, y, score, f }); else pl.set(id, { x, y, rx: x, ry: y, score, f }); });
  const meta = id => room.players.find(p => p.id === id) || {};
  $('scores').innerHTML = [...s.p].sort((a, b) => b[3] - a[3]).map(p => `<span class="sc" style="border-color:${meta(p[0]).color}">${esc(meta(p[0]).name || '?')}: ${p[3]}</span>`).join('');
});
socket.on('over', res => {
  show('lobby'); sfx('over');
  $('results').innerHTML = '<b>Итоги</b><br>' + res.map((r, i) => `${i ? i + 1 + '.' : '🏆'} ${esc(r.name)} — ${r.score}`).join('<br>');
});

// --- Рендер ---
const cv = $('cv'), ctx = cv.getContext('2d'); let sc = 1, dpr = 1;
function resize() {
  const st = $('stage'), aw = st.clientWidth - 16, ah = st.clientHeight - 8;
  sc = Math.min(aw / G.W, ah / G.H); if (!(sc > 0)) return; dpr = window.devicePixelRatio || 1;
  cv.style.width = G.W * sc + 'px'; cv.style.height = G.H * sc + 'px';
  cv.width = G.W * sc * dpr; cv.height = G.H * sc * dpr;
}
addEventListener('resize', resize);
function draw() {
  requestAnimationFrame(draw);
  if (!$('game').classList.contains('active')) return;
  const k = sc * dpr; ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, G.W, G.H);
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
  for (let x = 0; x <= G.W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, G.H); ctx.stroke(); }
  for (let y = 0; y <= G.H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(G.W, y); ctx.stroke(); }
  ctx.shadowBlur = 18; ctx.shadowColor = '#ffd24d'; ctx.fillStyle = '#ffd24d';
  stars.forEach(([x, y]) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? G.SR * .5 : G.SR * 1.4, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); });
  // Препятствия: красные шары с пульсирующим кольцом
  obst.forEach(o => {
    o.rx += (o.x - o.rx) * .35; o.ry += (o.y - o.ry) * .35;
    ctx.shadowColor = '#ff2d55'; ctx.fillStyle = '#3a0716'; ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(o.rx, o.ry, G.OR, 0, 7); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.globalAlpha = .5; ctx.beginPath(); ctx.arc(o.rx, o.ry, G.OR + 4 + Math.sin(Date.now() / 150) * 3, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  });
  // Бонусы-ускорители
  ctx.shadowColor = '#4dd2ff'; ctx.textAlign = 'center'; ctx.font = '30px sans-serif';
  bonus.forEach(([x, y]) => { ctx.fillText('⚡', x, y + 10 + Math.sin(Date.now() / 200) * 3); });
  pl.forEach((p, id) => {
    p.rx += (p.x - p.rx) * .35; p.ry += (p.y - p.ry) * .35; // сглаживание между тиками сервера
    const m = room && room.players.find(q => q.id === id); if (!m) return;
    const f = p.f || 0;
    ctx.globalAlpha = (f & 2) ? .4 : (f & 4) && Math.floor(Date.now() / 120) % 2 ? .6 : 1; // оглушён / неуязвим — мигает
    if (f & 1) { ctx.shadowColor = '#4dd2ff'; ctx.strokeStyle = '#4dd2ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.rx, p.ry, G.PR + 8, 0, 7); ctx.stroke(); } // ускорение
    ctx.shadowColor = m.color; ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(p.rx, p.ry, G.PR, 0, 7); ctx.fill();
    if (id === socket.id) { ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.shadowBlur = 18; }
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '600 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.name, p.rx, p.ry - G.PR - 8); ctx.shadowBlur = 18; ctx.globalAlpha = 1;
  });
}
draw();

// --- Управление: клавиатура (ПК) ---
const keys = {};
const map = { ArrowLeft: 'l', a: 'l', ф: 'l', ArrowRight: 'r', d: 'r', в: 'r', ArrowUp: 'u', w: 'u', ц: 'u', ArrowDown: 'd', s: 'd', ы: 'd' };
function kb() { input.x = (keys.r ? 1 : 0) - (keys.l ? 1 : 0); input.y = (keys.d ? 1 : 0) - (keys.u ? 1 : 0); }
addEventListener('keydown', e => { const k = map[e.key.toLowerCase()] ; if (k && document.activeElement.tagName !== 'INPUT') { keys[k] = true; kb(); e.preventDefault(); } });
addEventListener('keyup', e => { const k = map[e.key.toLowerCase()]; if (k) { keys[k] = false; kb(); } });

// --- Управление: сенсорный джойстик (смартфоны/планшеты) ---
const joy = $('joy'), knob = $('knob'); let jid = null;
function jmove(e) {
  const b = joy.getBoundingClientRect(), R = b.width / 2;
  let dx = e.clientX - (b.left + R), dy = e.clientY - (b.top + R); const l = Math.hypot(dx, dy) || 1, c = Math.min(l, R);
  dx = dx / l * c; dy = dy / l * c; knob.style.transform = `translate(${dx}px,${dy}px)`; input.x = dx / R; input.y = dy / R;
}
joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); jmove(e); });
joy.addEventListener('pointermove', e => { if (e.pointerId === jid) jmove(e); });
const jend = e => { if (e.pointerId === jid) { jid = null; knob.style.transform = ''; input.x = input.y = 0; } };
joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);

// Отправляем ввод ~20 раз/сек, только если он изменился
setInterval(() => {
  if (!$('game').classList.contains('active')) return;
  if (Math.abs(input.x - sent.x) > .02 || Math.abs(input.y - sent.y) > .02) { sent = { ...input }; socket.emit('input', sent); }
}, 50);

// --- Звуки (Web Audio, без файлов) ---
let ac = null, muted = localStorage.getItem('sc_mute') === '1';
function tone(f, d = .12, type = 'sine', v = .15, to = f, delay = 0) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
  } catch {}
}
function sfx(n, k = 1) {
  ({
    star: () => { tone(880, .09, 'triangle', .18 * k); tone(1320, .12, 'triangle', .18 * k, 1320, .07); },
    boost: () => tone(300, .35, 'sawtooth', .12 * k, 1200),
    hit: () => tone(220, .3, 'square', .18 * k, 60),
    tick: () => tone(660, .08, 'square', .07),
    start: () => [523, 659, 784].forEach((f, i) => tone(f, .15, 'triangle', .18, f, i * .1)),
    over: () => [784, 659, 523, 392].forEach((f, i) => tone(f, .2, 'triangle', .18, f, i * .14))
  })[n]();
}
// Звуки от событий сервера: свои — громко, чужие — тише
socket.on('fx', ({ t, id }) => {
  const me = id === socket.id; sfx(t, me ? 1 : .3);
  if (me && t === 'hit') navigator.vibrate?.(150); // вибрация на телефоне
});
$('mute').textContent = muted ? '🔇' : '🔊';
$('mute').onclick = () => { muted = !muted; localStorage.setItem('sc_mute', muted ? '1' : '0'); $('mute').textContent = muted ? '🔇' : '🔊'; };

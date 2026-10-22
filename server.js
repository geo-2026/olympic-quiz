/* 통합사회 올림픽 형성평가 — 고정 주소 서버 (sl-game2와 같은 Express + Socket.IO, Render 배포)
   역할 1 : 정적 파일 서빙 (admin.html · play.html · scenes/ …)
   역할 2 : 교사 브라우저(호스트)와 학생 브라우저 사이의 메시지 중계.
            게임 상태·채점은 지금까지와 같이 교사 브라우저(js/core/game.js)가 맡고, 서버는 방 코드별로 메시지만 전달한다.
   실행 : npm start → http://localhost:3000  (교사 /admin.html, 학생 /play.html) */
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;          // 호스트가 6시간 넘게 없는 방은 정리
const PRIVATE = /^\/(node_modules|tests|tools|docs|questions|server\.js|package(-lock)?\.json|render\.yaml|\.git)(\/|$)/;

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (req, res) => res.json({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) }));
app.get('/admin', (req, res) => res.redirect(302, '/admin.html' + queryOf(req)));
app.get(['/play', '/join'], (req, res) => res.redirect(302, '/play.html' + queryOf(req)));
app.use((req, res, next) => (PRIVATE.test(req.path) ? res.status(404).end() : next()));
app.use(express.static(ROOT, {
  index: 'index.html',
  setHeaders(res, file) { if (/\.(html|js|css)$/.test(file)) res.setHeader('Cache-Control', 'no-cache'); },
}));
function queryOf(req) { const i = req.url.indexOf('?'); return i < 0 ? '' : req.url.slice(i); }

const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 2e6, pingInterval: 10000, pingTimeout: 15000 });

/* ───────── 방 중계 ─────────
   rooms : 방 코드 → { host: 호스트 소켓, key: 호스트 비밀키(새로 고침·재접속 때 같은 코드를 이어받는 데 씀), clients: 학생 소켓 }
   호스트 → 학생 : host:send {to, payload} · host:broadcast payload · host:kick {to}
   학생 → 호스트 : client:hello {code} (ack {ok, id}) · client:send payload
   서버 → 호스트 : client:connect id · client:msg {from, payload} · client:disconnect id
   서버 → 학생   : msg payload · kicked · host:away · host:online */
const rooms = new Map();
const hostRoom = socket => { const r = socket.data.hostOf && rooms.get(socket.data.hostOf); return r && r.host === socket ? r : null; };
function leaveClient(socket) {
  const code = socket.data.room; if (!code) return;
  const room = rooms.get(code);
  if (room && room.clients.get(socket.id) === socket) { room.clients.delete(socket.id); if (room.host && room.host.connected) room.host.emit('client:disconnect', socket.id); }
  socket.data.room = null;
}

io.on('connection', socket => {
  socket.on('host:open', (msg, ack) => {
    if (typeof ack !== 'function') ack = () => { };
    const code = String((msg && msg.code) || ''), key = String((msg && msg.key) || '');
    if (!/^\d{4}$/.test(code)) return ack({ ok: false, error: 'bad-code' });
    let room = rooms.get(code);
    if (room && room.host && room.host.connected && room.host !== socket && room.key !== key) return ack({ ok: false, error: 'unavailable-id' });
    if (!room) { room = { code, key, host: null, clients: new Map(), createdAt: Date.now() }; rooms.set(code, room); }
    if (room.host && room.host !== socket) room.host.data.hostOf = null;   // 새로 고침 등으로 같은 교사가 이어받음
    room.host = socket; room.key = key; room.hostSince = Date.now(); socket.data.hostOf = code;
    ack({ ok: true, clients: [...room.clients.keys()] });
    for (const c of room.clients.values()) c.emit('host:online');
  });
  socket.on('host:send', msg => { const room = hostRoom(socket); const c = room && msg && room.clients.get(msg.to); if (c) c.emit('msg', msg.payload); });
  socket.on('host:broadcast', payload => { const room = hostRoom(socket); if (room) for (const c of room.clients.values()) c.emit('msg', payload); });
  socket.on('host:kick', msg => { const room = hostRoom(socket); const c = room && msg && room.clients.get(msg.to); if (c) { c.emit('kicked'); room.clients.delete(c.id); c.data.room = null; } });

  socket.on('client:hello', (msg, ack) => {
    if (typeof ack !== 'function') ack = () => { };
    const code = String((msg && msg.code) || ''), room = rooms.get(code);
    if (!room || !room.host || !room.host.connected) return ack({ ok: false, reason: 'no-host' });
    leaveClient(socket);
    room.clients.set(socket.id, socket); socket.data.room = code;
    ack({ ok: true, id: socket.id });
    room.host.emit('client:connect', socket.id);
  });
  socket.on('client:send', payload => { const room = rooms.get(socket.data.room); if (room && room.host && room.host.connected) room.host.emit('client:msg', { from: socket.id, payload }); });

  socket.on('disconnect', () => {
    const code = socket.data.hostOf;
    if (code) { const room = rooms.get(code); if (room && room.host === socket) { room.host = null; room.hostLeftAt = Date.now(); for (const c of room.clients.values()) c.emit('host:away'); } }
    leaveClient(socket);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (!room.host && now - (room.hostLeftAt || room.createdAt) > ROOM_TTL_MS) { for (const c of room.clients.values()) c.data.room = null; rooms.delete(code); }
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`통합사회 올림픽 형성평가 서버 : http://localhost:${PORT}`);
  console.log(`  교사 : http://localhost:${PORT}/admin.html   학생 : http://localhost:${PORT}/play.html`);
});

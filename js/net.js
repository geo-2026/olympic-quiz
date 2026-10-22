/* 실시간 통신 — 교사 브라우저가 호스트(서버 역할), 학생은 클라이언트.
   transport 'socket' : Socket.IO 중계 서버(server.js, Render 고정 주소). 서버가 방 코드별로 메시지를 전달한다 — 기본
   transport 'peer'   : PeerJS(WebRTC 데이터 채널, 공개 신호 서버 0.peerjs.com) — 서버가 없는 정적 호스팅(GitHub Pages)용·서버 장애 시 대체
   transport 'local'  : BroadcastChannel — 같은 브라우저의 탭끼리(시연·자동 테스트용) */
import { RELAY_URL } from './config.js';

const PEER_PREFIX = 'olq26-';
const hostId = code => `${PEER_PREFIX}${code}-host`;
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
const SOCKET_OPTS = { transports: ['websocket', 'polling'], reconnectionDelayMax: 5000, timeout: 8000 };
const RELAY_WAIT_MS = 7000;

/* 중계 서버 주소. '' 이면 서버 없음(정적 호스팅) */
export function relayUrl() {
  if (RELAY_URL) return RELAY_URL.replace(/\/+$/, '');
  if (location.protocol === 'file:' || /github\.io$/i.test(location.hostname)) return '';
  return location.origin;
}
export function detectTransport() {
  const q = new URLSearchParams(location.search).get('net');
  if (q === 'local' || q === 'peer' || q === 'socket') return q;
  return relayUrl() && typeof io === 'function' ? 'socket' : 'peer';
}
export const TRANSPORT_NAME = { socket: '서버 중계', peer: 'PeerJS 직접 연결', local: '같은 기기' };

/* ───────── 호스트 ───────── */
export class HostNet {
  constructor({ code, transport = 'socket', key = null }) {
    this.code = code; this.transport = transport; this.clients = new Map(); this.handlers = {};
    this.id = hostId(code); this.key = key || Math.random().toString(36).slice(2, 12);
  }
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
  emit(ev, ...a) { (this.handlers[ev] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
  async start() {
    if (this.transport === 'local') return this.startLocal();
    if (this.transport === 'socket') return this.startSocket();
    return this.startPeer();
  }
  startPeer() {
    return new Promise((resolve, reject) => {
      const peer = new Peer(this.id, { debug: 1, config: ICE });
      this.peer = peer;
      let opened = false;
      peer.on('open', id => { opened = true; this.emit('status', 'open'); resolve(id); });
      peer.on('connection', conn => {
        conn.on('open', () => { this.clients.set(conn.peer, conn); this.emit('connect', conn.peer); });
        conn.on('data', data => this.emit('message', conn.peer, data));
        const bye = () => { if (this.clients.get(conn.peer) === conn) this.clients.delete(conn.peer); this.emit('disconnect', conn.peer); };
        conn.on('close', bye); conn.on('error', bye);
      });
      peer.on('disconnected', () => { this.emit('status', 'reconnecting'); if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { } }, 1500); });
      peer.on('error', err => { console.warn('peer error', err.type, err); this.emit('error', err); if (!opened) reject(err); });
    });
  }
  startSocket() {
    return new Promise((resolve, reject) => {
      const url = relayUrl();
      if (!url || typeof io !== 'function') { reject({ type: 'relay-unavailable' }); return; }
      const s = io(url, SOCKET_OPTS);
      this.sock = s;
      let settled = false;
      const finish = (ok, err) => { if (settled) return; settled = true; clearTimeout(waitT); if (ok) resolve(this.id); else { try { s.close(); } catch (e) { } reject(err); } };
      const waitT = setTimeout(() => finish(false, { type: 'relay-unavailable' }), RELAY_WAIT_MS);
      s.on('connect', () => {
        s.emit('host:open', { code: this.code, key: this.key }, res => {
          if (res && res.ok) { (res.clients || []).forEach(id => this.clients.set(id, true)); this.emit('status', 'open'); finish(true); }
          else { const err = { type: (res && res.error) || 'server-error' }; this.emit('error', err); finish(false, err); }
        });
      });
      s.on('disconnect', () => { if (settled) this.emit('status', 'reconnecting'); });
      s.on('connect_error', e => { console.warn('relay connect_error', e && e.message); });
      s.on('client:connect', id => { this.clients.set(id, true); this.emit('connect', id); });
      s.on('client:msg', m => { if (m) this.emit('message', m.from, m.payload); });
      s.on('client:disconnect', id => { this.clients.delete(id); this.emit('disconnect', id); });
    });
  }
  startLocal() {
    this.bc = new BroadcastChannel('olq-' + this.code);
    this.bc.onmessage = e => {
      const m = e.data; if (!m || m.to !== 'host') return;
      if (m.kind === 'hello') { this.clients.set(m.from, true); this.emit('connect', m.from); this.bc.postMessage({ to: m.from, from: 'host', kind: 'hello' }); }
      else if (m.kind === 'bye') { this.clients.delete(m.from); this.emit('disconnect', m.from); }
      else this.emit('message', m.from, m.payload);
    };
    this.emit('status', 'open');
    return Promise.resolve(this.id);
  }
  send(clientId, payload) {
    if (this.transport === 'local') { this.bc.postMessage({ to: clientId, from: 'host', kind: 'msg', payload }); return; }
    if (this.transport === 'socket') { if (this.sock && this.sock.connected) this.sock.emit('host:send', { to: clientId, payload }); return; }
    const c = this.clients.get(clientId); if (c && c.open) { try { c.send(payload); } catch (e) { console.warn(e); } }
  }
  broadcast(payload) {
    if (this.transport === 'socket') { if (this.sock && this.sock.connected) this.sock.emit('host:broadcast', payload); return; }
    for (const id of this.clients.keys()) this.send(id, payload);
  }
  kick(clientId) {
    if (this.transport === 'local') { this.bc.postMessage({ to: clientId, from: 'host', kind: 'kick' }); return; }
    if (this.transport === 'socket') { if (this.sock) this.sock.emit('host:kick', { to: clientId }); this.clients.delete(clientId); return; }
    const c = this.clients.get(clientId); if (c) c.close();
  }
  stop() { if (this.peer) this.peer.destroy(); if (this.bc) this.bc.close(); if (this.sock) { try { this.sock.close(); } catch (e) { } this.sock = null; } }
}

/* ───────── 클라이언트(학생) ───────── */
export class ClientNet {
  constructor({ code, transport = 'socket' }) { this.code = code; this.transport = transport; this.handlers = {}; this.id = null; this.closed = false; this.tries = 0; this.helloed = false; }
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
  emit(ev, ...a) { (this.handlers[ev] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
  connect() {
    this.closed = false; clearTimeout(this.retryT);
    if (this.transport === 'local') return this.connectLocal();
    if (this.transport === 'socket') return this.connectSocket();
    return this.connectPeer();
  }
  connectPeer() {
    return new Promise(resolve => {
      this.emit('status', 'connecting');
      if (this.peer && !this.peer.destroyed) { try { this.peer.destroy(); } catch (e) { } }
      const peer = new Peer(undefined, { debug: 1, config: ICE });
      this.peer = peer;
      let settled = false;
      const fail = reason => { if (settled) return; settled = true; this.emit('status', 'closed', reason); this.scheduleRetry(); resolve(false); };
      peer.on('open', id => {
        this.id = id;
        const conn = peer.connect(hostId(this.code), { reliable: true, serialization: 'json' });
        this.conn = conn;
        const t = setTimeout(() => { if (!conn.open) { fail('timeout'); } }, 8000);
        conn.on('open', () => { clearTimeout(t); settled = true; this.tries = 0; this.emit('status', 'open'); resolve(true); });
        conn.on('data', d => this.emit('message', d));
        conn.on('close', () => { clearTimeout(t); if (settled) { this.emit('status', 'closed', 'close'); this.scheduleRetry(); } else fail('close'); });
        conn.on('error', e => { clearTimeout(t); fail(e && e.type || 'error'); });
      });
      peer.on('error', err => { console.warn('peer error', err.type); if (err.type === 'peer-unavailable') fail('no-host'); else fail(err.type); });
      peer.on('disconnected', () => { if (!peer.destroyed && !this.closed) { try { peer.reconnect(); } catch (e) { } } });
    });
  }
  ensureSocket() {
    if (this.sock) return this.sock;
    const s = this.sock = io(relayUrl(), SOCKET_OPTS);
    s.on('msg', d => this.emit('message', d));
    s.on('kicked', () => { this.helloed = false; this.emit('status', 'closed', 'kick'); });
    s.on('host:away', () => { this.helloed = false; this.emit('status', 'closed', 'no-host'); this.scheduleRetry(); });
    s.on('host:online', () => { if (!this.closed && !this.helloed) this.connect(); });
    s.on('disconnect', () => { this.helloed = false; if (!this.closed) this.emit('status', 'closed', 'close'); });
    s.on('connect', () => { if (!this.closed && !this.helloed && !this.connecting) this.connect(); });   // 소켓이 다시 붙으면 방에 다시 인사
    return s;
  }
  connectSocket() {
    return new Promise(resolve => {
      this.emit('status', 'connecting');
      const s = this.ensureSocket();
      if (!s.connected) {
        // 소켓이 붙으면 'connect' 핸들러가 connect()를 다시 불러 인사한다(socket.io가 스스로 재시도). 오래 안 붙으면 상태만 알림
        s.connect();
        clearTimeout(this.waitT);
        this.waitT = setTimeout(() => { if (!s.connected && !this.closed) this.emit('status', 'closed', 'timeout'); }, 10000);
        resolve(false); return;
      }
      this.connecting = true;
      s.emit('client:hello', { code: this.code }, res => {
        this.connecting = false;
        if (res && res.ok) { this.id = res.id; this.helloed = true; this.tries = 0; this.emit('status', 'open'); resolve(true); }
        else { this.helloed = false; this.emit('status', 'closed', (res && res.reason) || 'no-host'); this.scheduleRetry(); resolve(false); }
      });
    });
  }
  connectLocal() {
    this.id = this.id || 'c' + Math.random().toString(36).slice(2, 9);
    this.bc = this.bc || new BroadcastChannel('olq-' + this.code);
    this.emit('status', 'connecting');
    return new Promise(resolve => {
      let open = false;
      this.bc.onmessage = e => {
        const m = e.data; if (!m || m.to !== this.id) return;
        if (m.kind === 'hello') { open = true; this.tries = 0; this.emit('status', 'open'); resolve(true); }
        else if (m.kind === 'kick') { this.emit('status', 'closed', 'kick'); }
        else if (m.kind === 'msg') this.emit('message', m.payload);
      };
      this.bc.postMessage({ to: 'host', from: this.id, kind: 'hello' });
      setTimeout(() => { if (!open) { this.emit('status', 'closed', 'no-host'); this.scheduleRetry(); resolve(false); } }, 1500);
    });
  }
  scheduleRetry() {
    if (this.closed) return;
    clearTimeout(this.retryT);
    const delay = Math.min(15000, 1000 * Math.pow(1.6, Math.min(8, this.tries++)));
    this.emit('retry', delay);
    this.retryT = setTimeout(() => { if (!this.closed) this.connect(); }, delay);
  }
  get open() {
    if (this.transport === 'local') return true;
    if (this.transport === 'socket') return !!(this.sock && this.sock.connected && this.helloed);
    return !!(this.conn && this.conn.open);
  }
  send(payload) {
    if (this.transport === 'local') { this.bc.postMessage({ to: 'host', from: this.id, kind: 'msg', payload }); return true; }
    if (this.transport === 'socket') { if (this.open) { this.sock.emit('client:send', payload); return true; } return false; }
    if (this.conn && this.conn.open) { try { this.conn.send(payload); return true; } catch (e) { console.warn(e); } }
    return false;
  }
  close() {
    this.closed = true; clearTimeout(this.retryT);
    if (this.bc) { this.bc.postMessage({ to: 'host', from: this.id, kind: 'bye' }); }
    if (this.peer) this.peer.destroy();
    if (this.sock) { try { this.sock.close(); } catch (e) { } this.sock = null; this.helloed = false; }
  }
}

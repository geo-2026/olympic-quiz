/* 실시간 통신 — 교사 브라우저가 호스트(서버 역할), 학생은 클라이언트.
   transport 'peer'  : PeerJS(WebRTC 데이터 채널, 공개 신호 서버 0.peerjs.com) — 정적 호스팅(GitHub Pages)에서 서버 없이 동작
   transport 'local' : BroadcastChannel — 같은 브라우저의 탭끼리(시연·자동 테스트용) */
const PEER_PREFIX = 'olq26-';
const hostId = code => `${PEER_PREFIX}${code}-host`;
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

export function detectTransport() {
  const q = new URLSearchParams(location.search);
  return q.get('net') === 'local' ? 'local' : 'peer';
}

/* ───────── 호스트 ───────── */
export class HostNet {
  constructor({ code, transport = 'peer' }) {
    this.code = code; this.transport = transport; this.clients = new Map(); this.handlers = {};
    this.id = hostId(code);
  }
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
  emit(ev, ...a) { (this.handlers[ev] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
  async start() {
    if (this.transport === 'local') return this.startLocal();
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
    const c = this.clients.get(clientId); if (c && c.open) { try { c.send(payload); } catch (e) { console.warn(e); } }
  }
  broadcast(payload) { for (const id of this.clients.keys()) this.send(id, payload); }
  kick(clientId) { if (this.transport === 'local') { this.bc.postMessage({ to: clientId, from: 'host', kind: 'kick' }); return; } const c = this.clients.get(clientId); if (c) c.close(); }
  stop() { if (this.peer) this.peer.destroy(); if (this.bc) this.bc.close(); }
}

/* ───────── 클라이언트(학생) ───────── */
export class ClientNet {
  constructor({ code, transport = 'peer' }) { this.code = code; this.transport = transport; this.handlers = {}; this.id = null; this.closed = false; this.tries = 0; }
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
  emit(ev, ...a) { (this.handlers[ev] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
  connect() {
    this.closed = false;
    return this.transport === 'local' ? this.connectLocal() : this.connectPeer();
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
  get open() { return this.transport === 'local' ? true : !!(this.conn && this.conn.open); }
  send(payload) {
    if (this.transport === 'local') { this.bc.postMessage({ to: 'host', from: this.id, kind: 'msg', payload }); return true; }
    if (this.conn && this.conn.open) { try { this.conn.send(payload); return true; } catch (e) { console.warn(e); } }
    return false;
  }
  close() { this.closed = true; clearTimeout(this.retryT); if (this.bc) { this.bc.postMessage({ to: 'host', from: this.id, kind: 'bye' }); } if (this.peer) this.peer.destroy(); }
}

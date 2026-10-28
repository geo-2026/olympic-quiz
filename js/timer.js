/* 서버(호스트) 시계 기준 타이머와 긴장 효과 (명세서 7장) */
export class Timer {
  /**
   * el = { num, bar, root(효과 클래스를 붙일 요소), count(가운데 큰 숫자) }, audio = GameAudio(없으면 null)
   * opts.vibrate = 마지막 3초 진동(학생 화면), opts.submitted() = 제출 여부(효과 약하게)
   */
  constructor(el, audio = null, opts = {}) { this.el = el; this.audio = audio; this.opts = opts; this.offset = 0; this.raf = null; this.lastSec = null; this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; }
  sync(serverNow) { this.offset = serverNow - Date.now(); }
  now() { return Date.now() + this.offset; }
  start(startedAt, endsAt) {
    this.stop(); this.startedAt = startedAt; this.endsAt = endsAt; this.lastSec = null; this.ended = false;
    if (this.audio) { this.audio.setTempo(90); this.audio.startMusic(this.opts.qtype); }
    const tick = () => { this.render(); if (!this.ended) this.raf = requestAnimationFrame(tick); };
    tick();
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; if (this.audio) this.audio.stopMusic(); this.clearFx(); }
  clearFx() { const r = this.el.root; if (r) r.classList.remove('t-green', 't-yellow', 't-orange', 't-red', 't-last3', 't-over'); if (this.el.count) this.el.count.textContent = ''; }
  render() {
    const total = this.endsAt - this.startedAt, left = Math.max(0, this.endsAt - this.now()), ratio = total ? left / total : 0;
    const sec = Math.ceil(left / 1000);
    if (this.el.num) this.el.num.textContent = sec;
    if (this.el.bar) this.el.bar.style.width = (ratio * 100).toFixed(2) + '%';
    const r = this.el.root, submitted = this.opts.submitted ? this.opts.submitted() : false;
    if (r) {
      r.classList.remove('t-green', 't-yellow', 't-orange', 't-red');
      r.classList.add(ratio > 0.5 ? 't-green' : ratio > 0.3 ? 't-yellow' : left > 5000 ? 't-orange' : 't-red');
      r.classList.toggle('t-last3', left <= 3000 && left > 0 && !submitted && !this.reduced);
      r.classList.toggle('t-submitted', submitted);
    }
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      if (this.audio) { if (left <= 5000) this.audio.setTempo(150); else if (left <= 10000) this.audio.setTempo(120); if (left <= 5000 && left > 0) { this.audio.tick(); this.audio.heartbeat(); } }
      if (this.el.count) { this.el.count.textContent = left <= 3000 && left > 0 ? String(sec) : ''; if (left <= 3000 && left > 0) { this.el.count.classList.remove('pop'); void this.el.count.offsetWidth; this.el.count.classList.add('pop'); } }
      if (this.opts.vibrate && left <= 3000 && left > 0 && !submitted && navigator.vibrate) { try { navigator.vibrate(80); } catch (e) { } }
    }
    if (left <= 0 && !this.ended) { this.ended = true; if (r) r.classList.add('t-over'); if (this.audio) { this.audio.stopMusic(); this.audio.buzzer(); } if (this.opts.onEnd) this.opts.onEnd(); }
  }
}

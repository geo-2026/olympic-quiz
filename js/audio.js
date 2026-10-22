/* 합성 소리 (명세서 7.3) — Web Audio API로 직접 만듦. 저작권 음원 없음 */
export class GameAudio {
  constructor() { this.ctx = null; this.enabled = false; this.volume = 0.6; this.bpm = 90; this.loop = null; this.nextBeat = 0; this.beatIdx = 0; }
  enable(on = true) {
    this.enabled = on;
    if (on) { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); this.master = this.master || this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination); }
    else this.stopMusic();
    return this.enabled;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  tone(freq, dur, { type = 'square', gain = 0.3, at = 0, slide = 0 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + at, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { gain = 0.2, at = 0 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + at, n = this.ctx.sampleRate * dur, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = buf; g.gain.value = gain; s.connect(g); g.connect(this.master); s.start(t);
  }
  /* 긴장 음악 : 베이스 패턴 반복, BPM은 setTempo로 바뀜 */
  startMusic() {
    if (!this.enabled || !this.ctx) return;
    this.stopMusic(); this.nextBeat = this.ctx.currentTime + 0.05; this.beatIdx = 0;
    const pattern = [55, 55, 82.4, 55, 65.4, 55, 73.4, 61.7];
    this.loop = setInterval(() => {
      if (!this.ctx) return;
      while (this.nextBeat < this.ctx.currentTime + 0.25) {
        const f = pattern[this.beatIdx % pattern.length];
        this.tone(f, 0.18, { type: 'sawtooth', gain: 0.22, at: this.nextBeat - this.ctx.currentTime });
        this.tone(f * 2, 0.08, { type: 'square', gain: 0.05, at: this.nextBeat - this.ctx.currentTime });
        if (this.beatIdx % 2 === 0) this.noise(0.04, { gain: 0.06, at: this.nextBeat - this.ctx.currentTime });
        this.nextBeat += 60 / this.bpm / 2; this.beatIdx++;
      }
    }, 100);
  }
  setTempo(bpm) { this.bpm = bpm; }
  stopMusic() { if (this.loop) { clearInterval(this.loop); this.loop = null; } }
  tick() { this.tone(1800, 0.05, { type: 'square', gain: 0.12 }); }
  heartbeat() { this.tone(60, 0.12, { type: 'sine', gain: 0.5 }); this.tone(50, 0.16, { type: 'sine', gain: 0.4, at: 0.16 }); }
  buzzer() { this.tone(220, 0.7, { type: 'sawtooth', gain: 0.35 }); this.tone(110, 0.7, { type: 'square', gain: 0.2 }); }
  fanfare() { [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38]].forEach(([f, at]) => { this.tone(f, 0.35, { type: 'triangle', gain: 0.3, at }); this.tone(f / 2, 0.35, { type: 'square', gain: 0.08, at }); }); this.tone(1047, 0.8, { type: 'triangle', gain: 0.25, at: 0.55 }); }
  correct() { this.tone(880, 0.1, { type: 'triangle', gain: 0.25 }); this.tone(1320, 0.18, { type: 'triangle', gain: 0.25, at: 0.1 }); }
  wrong() { this.tone(200, 0.25, { type: 'sawtooth', gain: 0.2, slide: -120 }); }
  pop() { this.tone(600, 0.06, { type: 'square', gain: 0.12, slide: 300 }); }
}

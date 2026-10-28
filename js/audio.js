/* 소리 — BGM 폴더(교실용 녹음) 4개 음원만 쓴다.
   startMusic(qtype) 가 유형별 BGM/*.mp3 를 loop로 재생하고, fanfare() 가 승리 팡파레를 재생한다.
   정답/오답 음·버저·호루라기·환호·박수 등 다른 효과음은 모두 울리지 않는다(사용자 지시, 16절).
   호출부(js/admin.js, js/play.js, js/timer.js, scenes/*)는 그대로 두되 메서드가 no-op로 조용히 통과한다. */
const BGM_URL = {
  ox: 'BGM/01_OX_quiz_bgm.mp3',
  choice: 'BGM/02_multiple_choice_bgm.mp3',
  short: 'BGM/03_short_answer_bgm.mp3',
};
const FANFARE_URL = 'BGM/04_win_fanfare.mp3';

export class GameAudio {
  constructor() {
    this.enabled = false;
    this.volume = 0.6;
    this.bpm = 90;
    this.bgmEl = null;
    this.fanfareEl = null;
  }
  enable(on = true) {
    this.enabled = !!on;
    if (!this.enabled) this.stopMusic();
    return this.enabled;
  }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, +v));
    if (this.bgmEl) this.bgmEl.volume = Math.max(0, Math.min(1, this.volume * 0.6));
    if (this.fanfareEl) this.fanfareEl.volume = this.volume;
  }
  setTempo(bpm) {
    this.bpm = bpm;
    if (this.bgmEl) { try { this.bgmEl.playbackRate = Math.max(0.8, Math.min(1.4, bpm / 90)); } catch (e) {} }
  }
  startMusic(qtype) {
    if (!this.enabled) return;
    this.stopMusic();
    const url = BGM_URL[qtype];
    if (!url) return;
    try {
      const el = new Audio(url);
      el.loop = true;
      el.volume = Math.max(0, Math.min(1, this.volume * 0.6));
      try { el.playbackRate = Math.max(0.8, Math.min(1.4, this.bpm / 90)); } catch (e) {}
      this.bgmEl = el;
      el.play().catch(() => { if (this.bgmEl === el) this.bgmEl = null; });
    } catch (e) { /* 재생 실패해도 조용히 */ }
  }
  stopMusic() {
    if (this.bgmEl) { try { this.bgmEl.pause(); this.bgmEl.currentTime = 0; } catch (e) {} this.bgmEl = null; }
  }
  fanfare() {
    if (!this.enabled) return;
    try {
      if (this.fanfareEl) { try { this.fanfareEl.pause(); } catch (e) {} }
      const el = new Audio(FANFARE_URL);
      el.volume = this.volume;
      this.fanfareEl = el;
      el.play().catch(() => {});
    } catch (e) { /* 조용히 */ }
  }
  victory() { this.fanfare(); }
  // 아래 메서드들은 호환용 no-op (호출부가 변하지 않아도 되게)
  tick() {}
  heartbeat() {}
  buzzer() {}
  correct() {}
  wrong() {}
  pop() {}
  click() {}
  whistle() {}
  reveal() {}
  drumroll() {}
  cheer() {}
  applause() {}
  lose() {}
  countdown() {}
  // 저수준 합성 함수는 더 이상 쓰이지 않지만 호환 유지
  tone() {}
  noise() {}
  fx() { return false; }
  seq() { return false; }
}

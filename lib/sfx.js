/* 효과음 프리셋 - 기본 효과음은 sl-game2 저장소에서 가져온 MP3(assets/sfx/basic·common)를 쓰고,
   없거나 로드에 실패하면 lib/zzfx.js(ZzFX, MIT)로 합성한 소리로 자동 대체한다.
   window.SFX.set(on, volume) -> play('이름') / seq('fanfare') / note(주파수, 길이)
   관리자·학생 화면(js/audio.js)과 경기 장면(scenes/*)이 같이 쓴다. 장면은 부모 창의 'sound' 메시지로 켜짐·음량을 받는다.
   ZzFX 매개변수 순서 : volume, randomness, frequency, attack, sustain, release, shape(0 sin 1 tri 2 saw 3 tan 4 noise 5 square), shapeCurve,
     slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter */
window.SFX = (function () {
  const P = {
    blip: [.6, , 1300, .01, .03, .08, 1, 1.6, , , , , , , , , , .7],              // 학생 입장
    click: [.5, , 800, , .01, .05, 1, 2, , , , , , , , , , .5],                   // 제출·버튼
    tick: [.4, , 1500, , .02, .04, 1, 1, , , , , , , , , , .5],                   // 마지막 5초 째깍
    countdown: [.6, , 900, , .08, .08, 1, 1, , , , , , , , , , .6],               // 3·2·1
    correct: [.9, , 523, .02, .08, .18, 1, 1.3, , , 262, .08, , , , , , .8],      // 정답 (도->솔)
    wrong: [.9, , 170, .02, .18, .25, 2, 1.4, -5, , , , , , , , , .7],            // 오답
    whistle: [.9, .02, 2400, .03, .32, .1, 0, , , , , , , , , , , 1, , .6],       // 호루라기 (문제 시작)
    buzzer: [1, , 120, .03, .55, .25, 2, 1.3, , , , , , , , , , .8],              // 마감
    reveal: [.8, , 660, .02, .12, .3, 1, 1.2, , , 220, .1, , , , , .1, .8],       // 정답 공개 (팀 정보 없는 중립음)
    drumroll: [.7, .1, 110, , 1.3, .25, 4, 1.5, , , , , .045, 2, , , , .9],       // 경기 시작 드럼롤
    cheer: [1, .15, 160, .08, .9, .6, 4, .6, , , , , , 3, , , , .9, , .35],       // 환호
    cheerShort: [.9, .15, 180, .05, .5, .4, 4, .6, , , , , , 3, , , , .9, , .3],
    applause: [1, .25, 80, .2, 2.4, 1.1, 4, .55, , , , , .04, 5, , , , .85, , .55], // 박수 (길고 두텁게)
    crowd: [.5, .3, 70, .3, 2.2, 1.2, 4, .4, , , , , , 5, , , , .6, , .6],        // 관중 웅성
    sad: [.9, , 392, .04, .18, .4, 1, 1, -5, , , , , , , , , .8],                 // 아쉬움
    swoosh: [.7, .05, 300, .05, .2, .35, 4, 1.4, 9, , , , , 2.5, , , , .7],       // 도약·비행
    boing: [.8, .05, 220, .02, .1, .3, 1, 1.5, 12, , , , , , , , , .6],           // 점프
    thud: [1, , 70, .01, .06, .22, 4, 2.2, -4, , , , , 2.5, , , , .9],            // 착지·넘어짐
    stepSand: [.5, .2, 120, , .03, .1, 4, 1.6, -3, , , , , 2, , , , .6],          // 모래 착지
    footstep: [.4, .2, 200, , .02, .06, 4, 1.5, -6, , , , , 1.5, , , , .5],       // 발소리
    twang: [.9, .05, 320, .01, .05, .28, 1, 1.7, -9, , , , , , , , , .5],         // 활시위
    arrowHit: [1, .05, 1100, , .02, .14, 3, 2.6, -25, , , , , .8, , , , .5],      // 화살 과녁
    gunshot: [1.3, .1, 230, .01, .04, .3, 4, 2, -9, , , , , 4, , .4, , .6],       // 사격
    ping: [.8, , 1900, , .05, .25, 1, 1.6, , , , , , , , , .08, .6],              // 표적 명중
    slide: [.35, .1, 140, .03, .22, .12, 4, 1, , , , , , 2.2, , , , .8],          // 썰매 미끄러짐
    clang: [1, .05, 650, , .03, .22, 3, 2.1, -6, , , , , .6, , , , .5],           // 벽 충돌
    beep: [.6, , 660, , .1, .06, 1, 1, , , , , , , , , , .8],                     // 출발 신호 빨강·노랑
    go: [.8, , 990, , .28, .1, 1, 1, , , , , , , , , , .9],                       // 출발 신호 초록
    heave: [.6, .2, 130, .02, .07, .15, 2, 1.3, -2, , , , , , , , , .7],          // 줄다리기 영차
    creak: [.35, .3, 95, .04, .1, .12, 3, 1, , , , , , 1, , , , .6],              // 줄 삐걱
  };
  const SEQ = {   // [주파수, 시작(초), 길이(초)]
    fanfare: [[523, 0, .3], [659, .12, .3], [784, .24, .3], [1047, .38, .7]],
    victory: [[523, 0, .14], [523, .16, .14], [523, .32, .14], [659, .48, .3], [784, .8, .3], [659, 1.0, .18], [784, 1.18, .9]],
    lose: [[392, 0, .3], [370, .3, .3], [349, .6, .3], [330, .9, .8]],
  };
  // ── sl-game2 저장소에서 가져온 MP3 매핑. 로드 성공한 이름은 ZzFX 대신 이 음원이 울린다 ──
  // sfx.js가 /lib/sfx.js 에 있으므로 그 두 디렉터리 위가 저장소 루트. 장면(../../lib/sfx.js)도 똑같은 로직으로 해석된다.
  const SRC = {
    correct:   'assets/sfx/basic/correct.mp3',
    wrong:     'assets/sfx/basic/wrong.mp3',
    blip:      'assets/sfx/basic/arrive.mp3',    // 입장·제출
    click:     'assets/sfx/basic/move.mp3',      // 버튼·전환
    reveal:    'assets/sfx/basic/dice.mp3',      // 정답 공개 (중립음)
    whistle:   'assets/sfx/common/quiz_short.mp3', // 문제 시작
    countdown: 'assets/sfx/common/quiz_choice.mp3', // 선택 신호음
  };
  const MP3 = {};  // name -> {buf, dur} AudioBuffer 캐시
  function baseUrl() {
    try {
      const u = (document.currentScript && document.currentScript.src) || '';
      // .../lib/sfx.js -> .../
      return u.replace(/[^/]*$/, '').replace(/lib\/$/, '');
    } catch (e) { return ''; }
  }
  const BASE = baseUrl();
  const S = { on: false, vol: .6, P, SEQ, timers: [] };
  function ensureCtx() { if (!window.ZZFX) return null; try { ZZFX.resume(); } catch (e) {} return ZZFX.context && ZZFX.context() || ZZFX.audioContext || null; }
  function loadMp3(name) {
    if (MP3[name] !== undefined) return MP3[name];
    const src = SRC[name]; if (!src) { MP3[name] = null; return null; }
    MP3[name] = { pending: true };
    fetch(BASE + src).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(buf => { const ctx = ensureCtx(); if (!ctx) throw new Error('no ctx'); return ctx.decodeAudioData(buf); })
      .then(audio => { MP3[name] = { buf: audio, dur: audio.duration }; })
      .catch(() => { MP3[name] = null; });  // 실패하면 ZzFX로 폴백
    return MP3[name];
  }
  function playMp3(name, scale = 1) {
    const slot = MP3[name]; if (!slot || slot.pending || !slot.buf) return false;
    const ctx = ensureCtx(); if (!ctx) return false;
    try {
      const src = ctx.createBufferSource(); src.buffer = slot.buf;
      const g = ctx.createGain(); g.gain.value = (scale || 1);  // 전체 음량은 ZZFX.master가 담당
      src.connect(g); g.connect(ZZFX.master || ctx.destination); src.start(0); return true;
    } catch (e) { return false; }
  }
  S.set = (on, vol) => {
    S.on = !!on; if (vol != null) S.vol = Math.max(0, Math.min(1, +vol));
    if (window.ZZFX) { if (S.on) ZZFX.resume(); ZZFX.setMaster(S.vol); }
    if (S.on) { for (const name in SRC) if (MP3[name] === undefined) loadMp3(name); }
    return S.on;
  };
  S.play = (name, scale = 1) => {
    if (!S.on) return null;
    if (SRC[name] && playMp3(name, scale)) return true;    // sl-game2 MP3 우선
    if (!window.ZZFX || !P[name]) return null;
    try { return ZZFX.playSamples([ZZFX.buildSamples(...P[name])], scale); } catch (e) { return null; }
  };
  S.note = (freq, dur = .25, scale = 1) => { if (!S.on || !window.ZZFX) return null; try { return ZZFX.playSamples([ZZFX.buildSamples(.8, 0, freq, .01, dur, .25, 1, 1.2, 0, 0, 0, 0, 0, 0, 0, 0, .08, .8)], scale); } catch (e) { return null; } };
  S.seq = (name, scale = 1) => { if (!S.on || !SEQ[name]) return; SEQ[name].forEach(([f, at, d]) => S.timers.push(setTimeout(() => S.note(f, d, scale), at * 1000))); };
  S.stopAll = () => { S.timers.forEach(clearTimeout); S.timers = []; };
  // 사용자 조작이 있어야 소리가 나므로 첫 클릭 때 컨텍스트를 깨우고 아직 미로딩인 MP3를 받아 온다
  const wake = () => { if (window.ZZFX && S.on) ZZFX.resume(); if (S.on) for (const name in SRC) if (MP3[name] === undefined) loadMp3(name); };
  window.addEventListener('pointerdown', wake, { passive: true }); window.addEventListener('keydown', wake);
  return S;
})();

/* window.SFX : BGM 폴더의 효과음 MP3만 재생한다(16·17절).
   SFX.play('이름', scale) → BGM/<파일>.mp3 재생. 매핑에 없는 이름은 조용히 통과.
   관리자·학생(js/audio.js)과 경기 장면(scenes/*)이 같이 쓴다. 장면은 부모 창의 'sound' 메시지로 켜짐·음량을 받는다. */
window.SFX = (function () {
  // 각 경기별 효과음(BGM/*.mp3). 장면에서 쓰는 호출명이 그대로 키.
  const SRC = {
    tug_pull:        'BGM/tugofwar_pull.mp3',
    skijump_signal:  'BGM/skijump_signal.mp3',
    skijump_glide:   'BGM/skijump_glide.mp3',
    skijump_landing: 'BGM/skijump_landing.mp3',
    skeleton_start:  'BGM/skeleton_start.mp3',
    skeleton_glide:  'BGM/skeleton_glide.mp3',
    longjump_run:    'BGM/longjump_run.mp3',
    longjump_fly:    'BGM/longjump_fly.mp3',
    longjump_landing:'BGM/longjump_landing.mp3',
    archery_shoot:   'BGM/archery_shoot.mp3',
    archery_fly:     'BGM/archery_fly.mp3',
    archery_hit:     'BGM/archery_hit.mp3',
    shooting_fire:   'BGM/shooting_fire.mp3',
  };
  // sfx.js는 /lib/에 있다. 루트(admin.html, play.html)에서는 ../BGM, scenes/*/index.html에서는 ../../BGM이 되므로
  // document.currentScript.src 를 기준으로 BGM/ 상대 경로를 해석한다.
  function baseUrl() {
    try {
      const u = (document.currentScript && document.currentScript.src) || '';
      return u.replace(/[^/]*$/, '').replace(/lib\/$/, '');
    } catch (e) { return ''; }
  }
  const BASE = baseUrl();
  const CACHE = {}; // name -> {ctx, buf, pending}
  let ctx = null;
  function ensureCtx() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  const master = { gain: null };
  function ensureMaster() {
    const c = ensureCtx(); if (!c) return null;
    if (!master.gain) { master.gain = c.createGain(); master.gain.gain.value = S.vol; master.gain.connect(c.destination); }
    return master.gain;
  }
  function loadBuf(name) {
    if (CACHE[name] !== undefined) return CACHE[name];
    const src = SRC[name]; if (!src) { CACHE[name] = null; return null; }
    CACHE[name] = { pending: true };
    fetch(BASE + src)
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(buf => { const c = ensureCtx(); if (!c) throw new Error('no ctx'); return c.decodeAudioData(buf); })
      .then(audio => { CACHE[name] = { buf: audio }; })
      .catch(() => { CACHE[name] = null; });
    return CACHE[name];
  }
  function playBuf(name, scale) {
    const slot = CACHE[name]; if (!slot || slot.pending || !slot.buf) return false;
    const c = ensureCtx(); const m = ensureMaster(); if (!c || !m) return false;
    try {
      const src = c.createBufferSource(); src.buffer = slot.buf;
      const g = c.createGain(); g.gain.value = (scale == null ? 1 : scale);
      src.connect(g); g.connect(m); src.start(0);
      return true;
    } catch (e) { return false; }
  }
  const S = { on: false, vol: 0.6 };
  S.set = (on, vol) => {
    S.on = !!on;
    if (vol != null) S.vol = Math.max(0, Math.min(1, +vol));
    if (master.gain) master.gain.gain.value = S.vol;
    if (S.on) { ensureCtx(); for (const name in SRC) if (CACHE[name] === undefined) loadBuf(name); }
    return S.on;
  };
  S.play = (name, scale) => {
    if (!S.on) return null;
    if (!SRC[name]) return null;          // BGM 폴더에 없는 호출명은 조용히 무음
    if (CACHE[name] === undefined) loadBuf(name);
    return playBuf(name, scale);
  };
  S.note = () => null;                    // ZzFX 쓰지 않으므로 미사용
  S.seq  = () => null;
  S.stopAll = () => {};
  // 첫 조작이 있어야 소리가 나므로 미리 깨우고 로드
  const wake = () => { if (S.on) { ensureCtx(); for (const name in SRC) if (CACHE[name] === undefined) loadBuf(name); } };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
  return S;
})();

/* 줄다리기·스켈레톤·멀리뛰기 장면 공용 도우미 — 장면 키트(양궁·사격·스키점프)와 같은 블록 캐릭터·픽셀 얼굴·메시지 규약 */
window.DC = (function () {
  const FACES = {
    cat: { pal: { B: '#e8963a', D: '#b8641e', W: '#fff3dd', E: '#1b1b1b', K: '#ffffff', P: '#ff8fa6' }, g: ["BDBBBBDB", "BBDBBDBB", "BBBBBBBB", "BKEBBKEB", "BEEBBEEB", "BBWPPWBB", "BWWWWWWB", "BBWWWWBB"] },
    rabbit: { pal: { B: '#f2f2f2', W: '#ffffff', E: '#1b1b1b', K: '#ffffff', P: '#ff8fa6', C: '#ffc4d0' }, g: ["BBBBBBBB", "BBBBBBBB", "BBBBBBBB", "BKEBBKEB", "BEEBBEEB", "CBBPPBBC", "BBBWWBBB", "BBBBBBBB"] },
  };
  const COLORS = { rabbit: '#ff8fb6', cat: '#ffa64d' };
  function pxCanvas(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d')); return c; }
  function faceCanvas(k) { const f = FACES[k]; return pxCanvas(8, 8, x => f.g.forEach((row, y) => [...row].forEach((ch, i) => { x.fillStyle = f.pal[ch] || f.pal.B; x.fillRect(i, y, 1, 1); }))); }
  function seeded(s) { return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, (n >> 16) * f) | 0},${Math.min(255, ((n >> 8) & 255) * f) | 0},${Math.min(255, (n & 255) * f) | 0})`; }
  function noiseCanvas(base, seed, w = 8, h = 8, amt = .08) { const r = seeded(seed); return pxCanvas(w, h, x => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { x.fillStyle = shade(base, 1 - amt + r() * amt * 2); x.fillRect(i, j, 1, 1); } }); }
  function nearest(t) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.encoding = THREE.sRGBEncoding; return t; }
  function ctex(c, px) { const t = new THREE.CanvasTexture(c); return px ? nearest(t) : (t.encoding = THREE.sRGBEncoding, t); }
  function textTex(txt, w, h, bg, fg, font) { return ctex(pxCanvas(w, h, x => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = font; x.fillText(txt, w / 2, h / 2); })); }
  const LM = (t, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ map: t }, o));
  const solid = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, m, x, y, z, parent) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b; };
  function avatarUrl(k) { const src = faceCanvas(k); return pxCanvas(64, 64, x => { x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, 64, 64); }).toDataURL(); }

  /* 머리 : 얼굴은 -z 쪽. 토끼 귀·고양이 귀 포함 */
  function makeHead(k) {
    const f = FACES[k], B = f.pal.B;
    const side = LM(ctex(noiseCanvas(B, k.length * 31), true)), face = LM(ctex(faceCanvas(k), true));
    const g = new THREE.Group(), s = .42;
    const h = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), [side, side, side, side, side, face]); h.castShadow = true; g.add(h);
    if (k === 'rabbit')[-1, 1].forEach(q => { box(.08, .3, .05, side, q * .09, s / 2 + .15, .02, g); box(.04, .22, .051, solid('#ff9db0'), q * .09, s / 2 + .15, 0, g); });
    if (k === 'cat')[-1, 1].forEach(q => { box(.11, .1, .06, side, q * .14, s / 2 + .05, 0, g); box(.05, .05, .061, solid('#ff9db0'), q * .14, s / 2 + .03, -.002, g); });
    return g;
  }
  /* 서 있는 블록 인형. 앞 = -z. 팔·다리는 어깨·엉덩이를 축으로 도는 그룹(rotation.x로 흔듦)
     반환 : { root, body, head, armL, armR, legL, legR, torso } — root.position = 발 위치 */
  function makeFigure(k, accent, opt = {}) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const shirt = LM(ctex(noiseCanvas(opt.shirt || accent, 7, 8, 8, .06), true)), pants = LM(ctex(noiseCanvas(opt.pants || '#2c3e3a', 11, 8, 8, .12), true));
    const fur = LM(ctex(noiseCanvas(FACES[k].pal.B, 3, 4, 4, .06), true)), shoe = solid(opt.shoe || '#20262e');
    const limb = (w, len, mat, px, py, pz, parent) => { const g = new THREE.Group(); g.position.set(px, py, pz); parent.add(g); const m = box(w, len, w, mat, 0, -len / 2, 0, g); return g; };
    const legL = limb(.17, .74, pants, -.11, .8, 0, body), legR = limb(.17, .74, pants, .11, .8, 0, body);
    box(.18, .08, .24, shoe, 0, -.76, -.03, legL); box(.18, .08, .24, shoe, 0, -.76, -.03, legR);
    const torso = box(.42, .6, .24, shirt, 0, 1.1, 0, body); box(.43, .06, .25, solid(accent), 0, 1.38, 0, body);
    const armL = limb(.13, .56, shirt, -.28, 1.36, 0, body), armR = limb(.13, .56, shirt, .28, 1.36, 0, body);
    box(.11, .11, .11, fur, 0, -.6, 0, armL); box(.11, .11, .11, fur, 0, -.6, 0, armR);
    if (opt.bib) { const b = new THREE.Mesh(new THREE.PlaneGeometry(.22, .16), new THREE.MeshBasicMaterial({ map: textTex(opt.bib, 64, 48, '#ffffff', '#20304f', 'bold 34px "Share Tech Mono",monospace') })); b.position.set(0, 1.12, -.125); b.rotation.y = Math.PI; body.add(b); }
    const head = makeHead(k); head.position.set(0, 1.62, 0); body.add(head);
    return { root, body, head, armL, armR, legL, legR, torso };
  }
  /* 배너 */
  function banner(el) { let t = null; return { show(a, b, stay) { el.innerHTML = `${a}<small>${b || ''}</small>`; el.classList.add('show'); clearTimeout(t); if (!stay) t = setTimeout(() => el.classList.remove('show'), 2400); }, hide() { el.classList.remove('show'); } }; }
  /* 부모 창과의 메시지 : type 은 'tugDuel' 등. api[action](msg) 를 부름 */
  function bridge(type, api) {
    const listeners = {};
    const emit = (ev, data) => { (listeners[ev] || []).forEach(f => { try { f(data); } catch (e) { console.error(e); } }); try { if (window.parent !== window) window.parent.postMessage({ type: type + ':event', event: ev, data }, '*'); } catch (e) { } };
    window.addEventListener('message', e => { const m = e.data; if (!m || m.type !== type) return; const f = api[m.action]; if (f) { const r = f(m); if (m.action === 'playResult') emit('playAccepted', { accepted: r !== false }); } });
    return { emit, on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); } };
  }
  const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function params() { const Q = new URLSearchParams(location.search); return { Q, APP: Q.get('mode') === 'app', names: (Q.get('names') || '').split(',').filter(Boolean), auto: Q.get('auto') !== '0' && Q.get('mode') !== 'app' }; }
  return { FACES, COLORS, pxCanvas, faceCanvas, seeded, shade, noiseCanvas, nearest, ctex, textTex, LM, solid, box, avatarUrl, makeHead, makeFigure, banner, bridge, smooth, clamp, params };
})();

/* 블록 토끼·고양이 픽셀 얼굴 — 장면 키트의 FACES 데이터 재사용 (명세서 3.3) */
export const FACES = {
  cat: { pal: { B: '#e8963a', D: '#b8641e', W: '#fff3dd', E: '#1b1b1b', K: '#ffffff', P: '#ff8fa6' }, g: ['BDBBBBDB', 'BBDBBDBB', 'BBBBBBBB', 'BKEBBKEB', 'BEEBBEEB', 'BBWPPWBB', 'BWWWWWWB', 'BBWWWWBB'] },
  rabbit: { pal: { B: '#f2f2f2', W: '#ffffff', E: '#1b1b1b', K: '#ffffff', P: '#ff8fa6', C: '#ffc4d0' }, g: ['BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BKEBBKEB', 'BEEBBEEB', 'CBBPPBBC', 'BBBWWBBB', 'BBBBBBBB'] }
};
const cache = {};
export function faceDataUrl(k, size = 64) {
  const key = k + size; if (cache[key]) return cache[key];
  const f = FACES[k], c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  const s = size / 8;
  f.g.forEach((row, y) => [...row].forEach((ch, i) => { x.fillStyle = f.pal[ch] || f.pal.B; x.fillRect(Math.round(i * s), Math.round(y * s), Math.ceil(s), Math.ceil(s)); }));
  // 귀
  if (k === 'rabbit') { x.fillStyle = '#f2f2f2'; x.fillRect(size * .2, -size * .02, size * .14, size * .12); x.fillRect(size * .66, -size * .02, size * .14, size * .12); }
  return (cache[key] = c.toDataURL());
}
export function faceImg(k, size = 48, cls = '') { return `<img class="face ${cls}" src="${faceDataUrl(k, 64)}" width="${size}" height="${size}" alt="${k === 'rabbit' ? '토끼' : '고양이'}" style="image-rendering:pixelated">`; }

/* 종목별 경기 기록 만들기 (명세서 9장) — 점수가 높은 팀이 항상 경기에서 이기게 함 */
import { round1, other } from './scoring.js';
const r2 = v => Math.round(v * 100) / 100;
const fmtM = v => `${v >= 0 ? '+' : ''}${r2(v).toFixed(2)}m`;

/** 9.1 묶음 종목 : S = { rabbit, cat } (0~450) */
export function bundleRecord(sport, S) {
  const a = S.rabbit, b = S.cat;
  const winner = a === b ? 'draw' : a > b ? 'rabbit' : 'cat';
  const Sw = Math.max(a, b), Sl = Math.min(a, b), d = Math.max(0, Math.min(1, (Sw - Sl) / 450));
  const res = {};
  const mk = (team, value, label) => { res[team] = { value, label, fail: S[team] === 0 }; };
  if (sport === 'tug') {
    const pull = winner === 'draw' ? 0 : Math.min(2.0, r2(0.3 + 1.7 * d));
    for (const t of ['rabbit', 'cat']) { const v = winner === 'draw' ? 0 : t === winner ? pull : -pull; mk(t, v, fmtM(v)); }
    var finish = pull >= 2.0;
  } else if (sport === 'skijump') {
    const Dw = r2(100 + 39 * (Sw / 450)), Dl = winner === 'draw' ? Dw : r2(Dw - (2 + 18 * d));
    for (const t of ['rabbit', 'cat']) { const v = t === winner || winner === 'draw' ? Dw : Dl; mk(t, v, `${v.toFixed(1)}m`); }
  } else if (sport === 'skeleton') {
    const tw = r2(58.50 - 3.0 * (Sw / 450)), tl = winner === 'draw' ? tw : r2(tw + (0.10 + 1.5 * d));
    for (const t of ['rabbit', 'cat']) { const v = t === winner || winner === 'draw' ? tw : tl; mk(t, v, `${v.toFixed(2)}초`); }
  } else if (sport === 'longjump') {
    const Dw = r2(6.20 + 1.80 * (Sw / 450)), Dl = winner === 'draw' ? Dw : r2(Dw - (0.05 + 0.80 * d));
    for (const t of ['rabbit', 'cat']) { const v = t === winner || winner === 'draw' ? Dw : Dl; mk(t, v, `${v.toFixed(2)}m`); }
  } else throw new Error('묶음 종목이 아님: ' + sport);
  return { sport, mode: 'bundle', winner, scores: { rabbit: a, cat: b }, result: res, finish: sport === 'tug' ? finish : undefined };
}

/** 양궁 20점 과녁 : 2문항 T 합(0~300)을 1~20점 링으로 변환(15점 간격). Tsum=300 → 20점, Tsum=0 → 1점 */
export function archeryShotRing(Tsum) { return Math.max(1, Math.min(20, Math.ceil((Number(Tsum) || 0) / 15))); }
/** 사격 링 : T → 소수 점수(10.0~10.9) */
const ringValue = r => Number(r);

/** 9.2a 양궁 발별 종목(perShot) : 2문항 T 합(0~300). 진 팀은 1점 낮게 (최소 1점) */
export function perShotRecord(sport, Tsum, winner) {
  if (sport !== 'archery') throw new Error('perShot은 양궁만 지원해요: ' + sport);
  const res = {};
  const Tw = winner === 'draw' ? Math.max(Tsum.rabbit, Tsum.cat) : Tsum[winner];
  const wv = archeryShotRing(Tw);
  for (const t of ['rabbit', 'cat']) {
    const win = winner === 'draw' || t === winner;
    const v = win ? wv : Math.max(1, wv - 1);
    res[t] = { value: v, label: String(v), fail: Tsum[t] === 0 };
  }
  return { sport, mode: 'perShot', winner, scores: { rabbit: Tsum.rabbit, cat: Tsum.cat }, result: res };
}

/** 9.2 문항별 종목(사격) : T = { rabbit, cat }, winner = 문항 승리 팀('rabbit'|'cat'|'draw') */
export function perQuestionRecord(sport, T, winner) {
  const res = {};
  const Tw = winner === 'draw' ? Math.max(T.rabbit, T.cat) : T[winner];
  if (sport === 'pistol') {
    const wv = round1(Math.min(10.9, 10.0 + 0.006 * Tw));
    for (const t of ['rabbit', 'cat']) {
      const win = winner === 'draw' || t === winner;
      const v = round1(win ? wv : wv - 0.4);
      res[t] = { value: v, label: v.toFixed(1), fail: T[t] === 0 };
    }
  } else throw new Error('문항별 종목이 아님: ' + sport);
  return { sport, mode: 'perQuestion', winner, scores: { rabbit: T.rabbit, cat: T.cat }, result: res };
}

/** 양궁·사격 종목 합계 기록(장면 전광판·결과 표용) */
export function perQuestionTotals(records) {
  const tot = { rabbit: 0, cat: 0 };
  for (const r of records) for (const t of ['rabbit', 'cat']) tot[t] = round1(tot[t] + r.result[t].value);
  return tot;
}
export { other };

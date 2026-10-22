/* 종목 매핑·종목 승패·최종 합계 (명세서 1.1, 8.5~8.7, 12.1) */
import { TEAMS, round1 } from './scoring.js';

export const SPORTS = [
  { id: 'tug', name: '줄다리기', mode: 'bundle', size: 3, gauge: '힘 모으기', icon: '🪢', scene: 'tugDuel', play: '3문항 합산 → 한 판 당기기 1회', unit: 'm' },
  { id: 'skijump', name: '스키점프', mode: 'bundle', size: 3, gauge: '비행 에너지', icon: '⛷️', scene: 'skiJumpDuel', play: '3문항 합산 → 점프 1회', unit: 'm' },
  { id: 'skeleton', name: '스켈레톤', mode: 'bundle', size: 3, gauge: '스타트 파워', icon: '🛷', scene: 'skeletonDuel', play: '3문항 합산 → 주행 1회', unit: '초' },
  { id: 'longjump', name: '멀리뛰기', mode: 'bundle', size: 3, gauge: '도움닫기 스피드', icon: '🏃', scene: 'longJumpDuel', play: '3문항 합산 → 1차 시기 1회', unit: 'm' },
  { id: 'archery', name: '양궁', mode: 'perQuestion', size: 10, icon: '🏹', scene: 'archeryDuel', play: '1문항 = 1발', unit: '점' },
  { id: 'pistol', name: '사격', mode: 'perQuestion', size: Infinity, icon: '🎯', scene: 'pistolDuel', play: '1문항 = 1발', unit: '점' }
];
export const sportById = Object.fromEntries(SPORTS.map(s => [s.id, s]));

/** 문항 수 n → 종목 배정 목록 [{ sport, name, mode, from, to, nos, count, size }] (번호는 1부터) */
export function assignEvents(n) {
  const out = [];
  let no = 1;
  for (const s of SPORTS) {
    if (no > n) break;
    const count = Math.min(s.size, n - no + 1);
    if (count <= 0) break;
    const nos = Array.from({ length: count }, (_, i) => no + i);
    out.push({ sport: s.id, name: s.name, mode: s.mode, from: no, to: no + count - 1, nos, count, size: s.size, partialBundle: s.mode === 'bundle' && count < s.size });
    no += count;
  }
  return out;
}

/** 문항 번호가 속한 종목과 종목 안 순서 */
export function eventOfQuestion(events, no) {
  const idx = events.findIndex(e => no >= e.from && no <= e.to);
  if (idx < 0) return null;
  const ev = events[idx];
  return { ev, eventIndex: idx, indexInEvent: no - ev.from + 1, ofInEvent: ev.count, isLast: no === ev.to };
}

const sumBy = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

/**
 * 종목 승패. results = 정답 공개까지 끝난 QuestionResult 목록(각각 no, teams{rabbit:{T,correct,total,avgTime}}, winner)
 * 묶음 종목 : S = T 합 → 전체 정답률 → 평균 정답 시간 → 무승부. 문항별 종목 : 이긴 문항 수 → T 합 → 무승부
 */
export function eventWinner(ev, results) {
  const rs = results.filter(r => r.no >= ev.from && r.no <= ev.to).sort((a, b) => a.no - b.no);
  const stat = {};
  for (const t of TEAMS) {
    const Tsum = round1(sumBy(rs, r => r.teams[t].T));
    const correct = sumBy(rs, r => r.teams[t].correct), total = sumBy(rs, r => r.teams[t].total);
    const timeSum = sumBy(rs, r => (r.teams[t].avgTime ?? 0) * r.teams[t].correct);
    stat[t] = { Tsum, correct, total, correctRate: total ? Math.round(correct / total * 1000) / 10 : 0, avgTime: correct ? round1(timeSum / correct) : null,
      wins: rs.filter(r => r.winner === t).length };
  }
  const a = stat.rabbit, b = stat.cat;
  let winner = 'draw', decidedBy = '';
  if (rs.length) {
    if (ev.mode === 'bundle') {
      if (a.Tsum !== b.Tsum) { winner = a.Tsum > b.Tsum ? 'rabbit' : 'cat'; decidedBy = 'S'; }
      else if (a.correctRate !== b.correctRate) { winner = a.correctRate > b.correctRate ? 'rabbit' : 'cat'; decidedBy = '정답률'; }
      else { const at = a.avgTime ?? Infinity, bt = b.avgTime ?? Infinity; if (at !== bt) { winner = at < bt ? 'rabbit' : 'cat'; decidedBy = '평균 정답 시간'; } }
    } else {
      if (a.wins !== b.wins) { winner = a.wins > b.wins ? 'rabbit' : 'cat'; decidedBy = '승수'; }
      else if (a.Tsum !== b.Tsum) { winner = a.Tsum > b.Tsum ? 'rabbit' : 'cat'; decidedBy = '문항 점수 합'; }
    }
  }
  const status = rs.length === 0 ? 'notPlayed' : rs.length === ev.count ? 'done' : 'partial';
  return { sport: ev.sport, name: ev.name, mode: ev.mode, from: ev.from, to: ev.to, count: ev.count, questionNos: rs.map(r => r.no), played: rs.length,
    Tsum: { rabbit: a.Tsum, cat: b.Tsum }, wins: { rabbit: a.wins, cat: b.wins }, stats: stat, winner, decidedBy, status };
}

/** 8.7 최종 합계 = 진행한 문항 T 합 + 보너스 × 이긴 종목 수. 동점 → 메달 수 → 전체 평균 정답 시간 → 무승부 */
export function finalTotals(results, eventResults, bonus = 0) {
  const out = { totals: {}, Tsum: {}, medals: {}, avgTime: {}, correctRate: {}, bonus };
  for (const t of TEAMS) {
    const Tsum = round1(sumBy(results, r => r.teams[t].T));
    const medals = eventResults.filter(e => e.winner === t && e.status !== 'notPlayed').length;
    const correct = sumBy(results, r => r.teams[t].correct), total = sumBy(results, r => r.teams[t].total);
    const timeSum = sumBy(results, r => (r.teams[t].avgTime ?? 0) * r.teams[t].correct);
    out.Tsum[t] = Tsum; out.medals[t] = medals; out.totals[t] = round1(Tsum + bonus * medals);
    out.avgTime[t] = correct ? round1(timeSum / correct) : null; out.correctRate[t] = total ? Math.round(correct / total * 1000) / 10 : 0;
  }
  const a = 'rabbit', b = 'cat';
  if (out.totals[a] !== out.totals[b]) out.winner = out.totals[a] > out.totals[b] ? a : b;
  else if (out.medals[a] !== out.medals[b]) out.winner = out.medals[a] > out.medals[b] ? a : b;
  else { const at = out.avgTime[a] ?? Infinity, bt = out.avgTime[b] ?? Infinity; out.winner = at === bt ? 'draw' : at < bt ? a : b; }
  out.diff = round1(Math.abs(out.totals[a] - out.totals[b]));
  return out;
}

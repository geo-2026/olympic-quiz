import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignEvents, eventOfQuestion, eventWinner, finalTotals } from '../js/core/events.js';

const sig = evs => evs.map(e => `${e.sport}:${e.from}-${e.to}`).join(',');
test('문항 수별 종목 매핑 1, 3, 4, 11, 12, 13, 22, 23, 30', () => {
  assert.equal(sig(assignEvents(1)), 'tug:1-1');
  assert.equal(sig(assignEvents(3)), 'tug:1-3');
  assert.equal(sig(assignEvents(4)), 'tug:1-3,skijump:4-4');
  const e11 = assignEvents(11); assert.equal(sig(e11), 'tug:1-3,skijump:4-6,skeleton:7-9,longjump:10-11'); assert.equal(e11[3].partialBundle, true); assert.equal(e11[3].count, 2);
  assert.equal(sig(assignEvents(12)), 'tug:1-3,skijump:4-6,skeleton:7-9,longjump:10-12');
  assert.equal(sig(assignEvents(13)), 'tug:1-3,skijump:4-6,skeleton:7-9,longjump:10-12,archery:13-13');
  assert.equal(sig(assignEvents(22)), 'tug:1-3,skijump:4-6,skeleton:7-9,longjump:10-12,archery:13-22');
  assert.equal(sig(assignEvents(23)), 'tug:1-3,skijump:4-6,skeleton:7-9,longjump:10-12,archery:13-22,pistol:23-23');
  const e30 = assignEvents(30); assert.equal(sig(e30), 'tug:1-3,skijump:4-6,skeleton:7-9,longjump:10-12,archery:13-22,pistol:23-30'); assert.equal(e30[5].count, 8);
  const i = eventOfQuestion(e30, 15); assert.equal(i.ev.sport, 'archery'); assert.equal(i.indexInEvent, 3); assert.equal(i.ofInEvent, 10); assert.equal(i.isLast, false);
  assert.equal(eventOfQuestion(e30, 12).isLast, true);
});

const R = (no, Tr, Tc, w, extra = {}) => ({ no, teams: { rabbit: { T: Tr, correct: extra.cr ?? 1, total: 2, avgTime: extra.ar ?? 5 }, cat: { T: Tc, correct: extra.cc ?? 1, total: 2, avgTime: extra.ac ?? 5 } }, winner: w });

test('8.5 묶음 점수 S 합산과 승리 팀 (예시 287.5 : 241.0)', () => {
  const ev = assignEvents(3)[0];
  const ew = eventWinner(ev, [R(1, 99, 105, 'cat'), R(2, 120.5, 80, 'rabbit'), R(3, 68, 56, 'rabbit')]);
  assert.equal(ew.Tsum.rabbit, 287.5); assert.equal(ew.Tsum.cat, 241); assert.equal(ew.winner, 'rabbit'); assert.equal(ew.status, 'done');
});
test('8.5 S 동점 → 정답률 → 평균 시간 → 무승부', () => {
  const ev = assignEvents(3)[0];
  assert.equal(eventWinner(ev, [R(1, 100, 100, 'draw', { cr: 1, cc: 2 })]).winner, 'cat');
  assert.equal(eventWinner(ev, [R(1, 100, 100, 'draw', { ar: 3, ac: 4 })]).winner, 'rabbit');
  assert.equal(eventWinner(ev, [R(1, 100, 100, 'draw')]).winner, 'draw');
  assert.equal(eventWinner(ev, []).status, 'notPlayed'); assert.equal(eventWinner(ev, [R(1, 1, 0, 'rabbit')]).status, 'partial');
});
test('8.6 문항별 종목 : 5승 5패면 T 합, T 합도 같으면 무승부', () => {
  const ev = assignEvents(22)[4];
  const rs = [];
  for (let i = 0; i < 10; i++) rs.push(R(13 + i, i < 5 ? 100 : 50, i < 5 ? 50 : 100, i < 5 ? 'rabbit' : 'cat'));
  const ew = eventWinner(ev, rs); assert.equal(ew.wins.rabbit, 5); assert.equal(ew.winner, 'draw');
  rs[9] = R(22, 50, 101, 'cat'); assert.equal(eventWinner(ev, rs).winner, 'cat'); assert.equal(eventWinner(ev, rs).decidedBy, '문항 점수 합');
  rs[9] = R(22, 50, 100, 'rabbit'); assert.equal(eventWinner(ev, rs).winner, 'rabbit');
});
test('8.7 최종 합계 : 보너스 0점과 50점', () => {
  const rs = [R(1, 100, 90, 'rabbit'), R(2, 80, 95, 'cat')];
  const evs = [{ sport: 'tug', winner: 'cat', status: 'done' }, { sport: 'skijump', winner: 'cat', status: 'partial' }];
  const f0 = finalTotals(rs, evs, 0); assert.equal(f0.totals.rabbit, 180); assert.equal(f0.totals.cat, 185); assert.equal(f0.winner, 'cat'); assert.equal(f0.diff, 5);
  const f50 = finalTotals(rs, evs, 50); assert.equal(f50.totals.cat, 285); assert.equal(f50.medals.cat, 2); assert.equal(f50.totals.rabbit, 180);
  const tie = finalTotals([R(1, 100, 100, 'draw')], [{ sport: 'tug', winner: 'rabbit', status: 'done' }], 0); assert.equal(tie.winner, 'rabbit');
});

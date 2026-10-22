import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentScore, normalizeAnswer, hintOf, isCorrect, gradeQuestion, questionWinner } from '../js/core/scoring.js';

test('8.1 학생 점수 : 남은 시간 0초, 제한 시간과 같음, 예시 137.5', () => {
  assert.equal(studentScore(true, 0, 20000), 100);
  assert.equal(studentScore(true, 20000, 20000), 150);
  assert.equal(studentScore(true, 15000, 20000), 137.5);
  assert.equal(studentScore(false, 15000, 20000), 0);
});

test('마감 직후 0.4초 도착은 유효, 0.6초는 무효', () => {
  const q = { type: 'ox', answers: ['O'] };
  const t = { startedAt: 0, endsAt: 15000, limit: 15 };
  const g = gradeQuestion(q, { rabbit: ['a', 'b'], cat: [] }, { a: { value: 'O', receivedAt: 15400 }, b: { value: 'O', receivedAt: 15600 } }, t);
  assert.equal(g.perStudent.a.submitted, true); assert.equal(g.perStudent.a.score, 100);
  assert.equal(g.perStudent.b.submitted, false); assert.equal(g.perStudent.b.score, 0);
});

test('8.2 팀 점수 T : 분모는 미제출 포함 팀 인원 (예시 ≈ 99.0)', () => {
  const q = { type: 'choice', answers: [2] };
  const roster = { rabbit: Array.from({ length: 15 }, (_, i) => 'r' + i), cat: ['c0'] };
  const answers = {};
  for (let i = 0; i < 11; i++) answers['r' + i] = { value: 2, receivedAt: 6000 }; // 6초, 남은 14초 → 135점
  const g = gradeQuestion(q, roster, answers, { startedAt: 0, endsAt: 20000, limit: 20 });
  assert.equal(g.teams.rabbit.T, 99);
  assert.equal(g.teams.rabbit.correct, 11); assert.equal(g.teams.rabbit.total, 15); assert.equal(g.teams.rabbit.correctRate, 73.3); assert.equal(g.teams.rabbit.avgTime, 6);
  assert.equal(g.teams.cat.T, 0); assert.equal(g.winner, 'rabbit');
});

test('8.3 문항 승리 동점 처리 4단계와 모두 0점 무승부', () => {
  const mk = (T, rate, avg, first) => ({ T, correctRate: rate, avgTime: avg, firstCorrectAt: first });
  assert.equal(questionWinner({ rabbit: mk(100, 50, 5, 1), cat: mk(90, 50, 5, 1) }), 'rabbit');
  assert.equal(questionWinner({ rabbit: mk(100, 50, 5, 1), cat: mk(100, 60, 5, 1) }), 'cat');
  assert.equal(questionWinner({ rabbit: mk(100, 50, 4, 1), cat: mk(100, 50, 5, 1) }), 'rabbit');
  assert.equal(questionWinner({ rabbit: mk(100, 50, 5, 9), cat: mk(100, 50, 5, 3) }), 'cat');
  assert.equal(questionWinner({ rabbit: mk(100, 50, 5, 3), cat: mk(100, 50, 5, 3) }), 'draw');
  assert.equal(questionWinner({ rabbit: mk(0, 0, null, null), cat: mk(0, 0, null, null) }), 'draw');
});

test('8.4 정규화 : 헌법 소원 = 헌법소원 = " 헌법소원. "', () => {
  const q = { type: 'short', answers: ['헌법 소원', '헌법소원'] };
  assert.ok(isCorrect(q, '헌법소원')); assert.ok(isCorrect(q, '헌법 소원')); assert.ok(isCorrect(q, ' 헌법소원. ')); assert.ok(!isCorrect(q, '헌법'));
  assert.equal(normalizeAnswer(' Un 헌장. '), 'un헌장');
  assert.ok(isCorrect({ type: 'ox', answers: ['O'] }, 'o')); assert.ok(isCorrect({ type: 'choice', answers: [3] }, '3'));
});

test('8.4 힌트 : 인권 → ㅁㅁ, 블록 캐릭터 → ㅁㅁ ㅁㅁㅁ, UN 헌장 → ㅁㅁ ㅁㅁ', () => {
  assert.equal(hintOf('인권').hint, 'ㅁㅁ');
  assert.equal(hintOf('블록 캐릭터').hint, 'ㅁㅁ ㅁㅁㅁ'); assert.deepEqual(hintOf('블록 캐릭터').parts, [2, 3]);
  assert.equal(hintOf('UN 헌장').hint, 'ㅁㅁ ㅁㅁ');
  assert.equal(hintOf('헌법 소원').label, 'ㅁㅁ ㅁㅁ (2글자 · 2글자)');
});

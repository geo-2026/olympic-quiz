import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheets, validate, toQuestions, publicQuestion, TEMPLATE_HEADER, TEMPLATE_ROWS } from '../js/core/questions.js';

test('부록 A 양식(단일 시트) 읽기·검증', () => {
  const qs = parseSheets([{ name: 'Sheet1', rows: [TEMPLATE_HEADER, ...TEMPLATE_ROWS] }]);
  assert.equal(validate(qs), 0);
  const Q = toQuestions(qs);
  assert.equal(Q.length, 6); assert.equal(Q[0].type, 'ox'); assert.deepEqual(Q[0].answers, ['X']); assert.equal(Q[0].limit, 15);
  assert.equal(Q[1].type, 'choice'); assert.deepEqual(Q[1].answers, [1]); assert.equal(Q[1].options.length, 4); assert.equal(Q[1].limit, 20);
  assert.equal(Q[4].type, 'short'); assert.deepEqual(Q[4].answers, ['헌법 소원', '헌법소원']); assert.equal(Q[4].limit, 40);
  const p = publicQuestion(Q[4]); assert.equal(p.hint.hint, 'ㅁㅁ ㅁㅁ'); assert.equal(p.answers, undefined); assert.equal(p.explanation, undefined);
});

test('오류 행 : 유형 모름, 문제 빈칸, 보기 3개, 정답 범위, OX 아님, 시간 범위', () => {
  const rows = [TEMPLATE_HEADER,
    [1, '??', '문제', '', '', '', '', 'O', '', '', '', ''],
    [2, 'OX', '', '', '', '', '', 'O', '', '', '', ''],
    [3, '선다', '문제', 'a', 'b', 'c', '', '1', '', '', '', ''],
    [4, '선다', '문제', 'a', 'b', 'c', 'd', '5', '', '', '', ''],
    [5, 'OX', '문제', '', '', '', '', 'Y', '', '', '', ''],
    [6, '주관식', '문제', '', '', '', '', '답', '', '200', '', ''],
    [7, '주관식', '문제', '', '', '', '', '답', '', '30', 'N', '']];
  const qs = parseSheets([{ name: 'S', rows }]);
  assert.equal(validate(qs), 6);
  assert.match(qs[0].errors[0], /유형/); assert.match(qs[1].errors[0], /문제/); assert.match(qs[2].errors[0], /보기/); assert.match(qs[3].errors[0], /정답/); assert.match(qs[4].errors[0], /O\/X/); assert.match(qs[5].errors[0], /5~120/);
  assert.equal(qs[6].errors.length, 0); assert.equal(qs[6].showHint, false);
});

test('유형 열이 없는 시트 3개(OX·선택형·단답형) → 시트 이름으로 유형, 순서대로 번호', () => {
  const sheets = [
    { name: 'OX', rows: [['문제', '정답', '해설'], ['진술1', 'O', '해'], ['진술2', 'X', '']] },
    { name: '선택형', rows: [['문제', '보기1', '보기2', '보기3', '보기4', '정답', '해설'], ['고르시오', 'a', 'b', 'c', 'd', 2, '']] },
    { name: '단답형', rows: [['문제', '정답', '해설'], ['쓰시오', '과잉 금지의 원칙|과잉 금지 원칙', '']] }
  ];
  const qs = parseSheets(sheets); assert.equal(validate(qs), 0);
  const Q = toQuestions(qs);
  assert.deepEqual(Q.map(q => q.type), ['ox', 'ox', 'choice', 'short']);
  assert.deepEqual(Q[2].answers, [2]); assert.deepEqual(Q[3].answers, ['과잉 금지의 원칙', '과잉 금지 원칙']); assert.equal(Q[3].no, 4);
  assert.equal(publicQuestion(Q[3]).hint.label, 'ㅁㅁ ㅁㅁㅁ ㅁㅁ (2글자 · 3글자 · 2글자)');
});

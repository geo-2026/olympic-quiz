import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/core/game.js';

const mkQs = n => Array.from({ length: n }, (_, i) => ({ type: 'ox', text: `문제 ${i + 1}`, options: [], answers: ['O'], explanation: '', limit: 15, showHint: false, image: '' }));
function setup(n, students = 4) {
  let t = 1000; const clock = { now: () => t, tick: ms => { t += ms; } };
  const g = new Game({ code: '1234', now: clock.now, random: () => 0.3 });
  g.setQuestions(mkQs(n));
  const ids = [];
  for (let i = 0; i < students; i++) { const r = g.join({ studentNo: String(10201 + i), name: '학생' + (i + 1), clientId: 'c' + i }); ids.push(r.student.id); }
  return { g, clock, ids };
}
function playQuestion(g, clock, ids, pattern) { // pattern : 각 학생이 정답 'O'/오답 'X'/미제출 null
  g.startQuestion();
  ids.forEach((id, i) => { clock.tick(1000); if (pattern[i] != null) g.submitAnswer(id, g.question.id, pattern[i]); });
  if (g.phase === 'QUESTION_OPEN') { clock.tick(20000); g.closeQuestion('time'); }
  return g.reveal();
}

test('자동 팀 배정은 인원이 적은 팀으로, 차이 1명 이하. 재접속은 같은 팀', () => {
  const { g, ids } = setup(3, 5);
  const c = g.counts(); assert.equal(Math.abs(c.rabbit - c.cat), 1);
  const st = g.state.students[ids[0]];
  const r = g.join({ studentNo: st.studentNo, name: st.name, token: st.token, clientId: 'c0' });
  assert.equal(r.reconnected, true); assert.equal(r.student.team, st.team); assert.equal(r.student.duplicate, false);
  const d = g.join({ studentNo: st.studentNo, name: st.name, clientId: 'other' }); assert.equal(d.student.duplicate, true);
  assert.ok(g.join({ studentNo: '123', name: '가나', clientId: 'x' }).error);
  assert.ok(g.join({ studentNo: '12345', name: '가', clientId: 'x' }).error);
});

test('상태 전이 : 묶음 종목 3문항 → 경기 1회 → 전환 → 다음 종목, 문항별 종목은 문항마다 경기', () => {
  const { g, clock, ids } = setup(14);
  assert.throws(() => g.next());
  g.startGame(); assert.equal(g.phase, 'READY');
  // 1~3 줄다리기
  for (let i = 0; i < 3; i++) {
    const r = playQuestion(g, clock, ids, ['O', 'O', 'X', null]);
    assert.equal(g.phase, 'REVEAL'); assert.equal(r.bundle.done, i + 1); assert.equal(r.bundle.of, 3);
    if (i < 2) { assert.equal(g.canPlayScene(), false); assert.equal(g.next(), 'READY'); }
  }
  assert.equal(g.canPlayScene(), true); assert.throws(() => g.next());
  const sc = g.playScene(); assert.equal(sc.mode, 'bundle'); assert.equal(sc.sport, 'tug'); assert.deepEqual(sc.questions, [1, 2, 3]); assert.equal(sc.of, 1);
  g.sceneDone(); assert.equal(g.next(), 'EVENT_SUMMARY');
  const sm = g.state.summary; assert.equal(sm.event.sport, 'tug'); assert.equal(sm.next.sport, 'skijump'); assert.ok(sm.diff >= 0);
  assert.equal(g.nextEvent(), 'READY'); assert.equal(g.question.no, 4);
  // 4~12 빠르게
  for (let no = 4; no <= 12; no++) { playQuestion(g, clock, ids, ['O', 'X', 'O', 'O']); if (g.canPlayScene()) { g.playScene(); g.sceneDone(); } g.next(); if (g.phase === 'EVENT_SUMMARY') g.nextEvent(); }
  assert.equal(g.question.no, 13); assert.equal(g.state.eventResults.length, 4);
  // 13~14 양궁 : 2문항=1발, 발이 끝날 때(14번) 경기
  playQuestion(g, clock, ids, ['O', 'O', 'O', 'O']);
  assert.equal(g.canPlayScene(), false);   // 첫 문항은 발 중간 → 경기 불가
  assert.equal(g.next(), 'READY'); assert.equal(g.question.no, 14);
  playQuestion(g, clock, ids, ['X', 'X', 'O', 'O']);
  assert.equal(g.canPlayScene(), true);
  const a = g.playScene(); assert.equal(a.mode, 'perShot'); assert.equal(a.index, 1); assert.equal(a.of, 1); assert.deepEqual(a.questions, [13, 14]);
  g.sceneDone();
  assert.equal(g.next(), 'EVENT_SUMMARY'); assert.equal(g.state.summary.isFinal, true);
  assert.equal(g.nextEvent(), 'FINAL');
  const f = g.state.final; assert.equal(f.played, 14); assert.equal(f.events.length, 5); assert.ok(['rabbit', 'cat', 'draw'].includes(f.winner));
  assert.equal(f.students.length, 4); assert.equal(f.students[0].perQ.length, 14);
});

test('모두 제출하면 자동 마감, 시간 종료 뒤 제출은 무시, 두 번째 제출 무시', () => {
  const { g, clock, ids } = setup(3);
  g.startGame(); g.startQuestion();
  const qid = g.question.id;
  assert.equal(g.submitAnswer(ids[0], qid, 'O').accepted, true);
  assert.equal(g.submitAnswer(ids[0], qid, 'X').accepted, false);
  clock.tick(16000); // 15초 제한 + 0.5초 여유 초과
  assert.equal(g.submitAnswer(ids[1], qid, 'O').reason, 'late');
  g.closeQuestion('time'); assert.equal(g.phase, 'QUESTION_CLOSED');
  const r = g.reveal(); assert.equal(r.teams[g.state.students[ids[0]].team].correct, 1);
  g.next(); g.startQuestion();
  ids.forEach(id => g.submitAnswer(id, g.question.id, 'O'));
  assert.equal(g.phase, 'QUESTION_CLOSED'); assert.equal(g.state.q.closedReason, 'all');
});

test('게임 시작 뒤 입장한 학생은 다음 문항부터 참여', () => {
  const { g, clock, ids } = setup(3, 2);
  g.startGame(); g.startQuestion();
  const late = g.join({ studentNo: '19999', name: '지각생', clientId: 'late' }).student;
  assert.equal(late.joinedAtQuestion, 1);
  assert.equal(g.submitAnswer(late.id, g.question.id, 'O').reason, 'notInRoster');
  clock.tick(20000); g.closeQuestion('time'); g.reveal(); g.next(); g.startQuestion();
  assert.ok(g.state.q.roster[late.team].includes(late.id));
});

test('12.1 묶음 종목 2/3문항에서 게임 종료 : 2문항 T 합으로 부분 진행, 장면 없음, 진행 중 문항 제외', () => {
  const { g, clock, ids } = setup(6);
  g.startGame();
  playQuestion(g, clock, ids, ['O', 'O', 'O', 'O']); g.next();
  playQuestion(g, clock, ids, ['O', 'O', 'X', 'X']); g.next();
  g.startQuestion(); g.submitAnswer(ids[0], g.question.id, 'O');
  const info = g.endGameInfo(); assert.equal(info.inProgress, 3);
  g.endGame();
  assert.equal(g.phase, 'FINAL');
  const f = g.state.final; assert.equal(f.played, 2);
  const tug = f.events.find(e => e.sport === 'tug'); assert.equal(tug.status, 'partial'); assert.equal(tug.played, 2); assert.equal(tug.record, null);
  assert.equal(f.events.find(e => e.sport === 'skijump').status, 'notPlayed');
  assert.equal(f.totals.rabbit + f.totals.cat > 0, true);
});

test('스냅샷 복구', () => {
  const { g, clock, ids } = setup(3);
  g.startGame(); playQuestion(g, clock, ids, ['O', null, 'O', 'X']);
  const snap = g.snapshot();
  const g2 = Game.restore(snap, { now: clock.now, random: () => 0.5 });
  assert.equal(g2.phase, 'REVEAL'); assert.equal(g2.state.results.length, 1); assert.equal(g2.next(), 'READY');
  const sv = g2.studentView(ids[0]); assert.equal(sv.phase, 'READY'); assert.equal(sv.ready.no, 2);
});

test('묶음 종목은 정답·해설만 공개(secret) : 학생 view에 팀 통계·문항 승리 팀 없음, 장면 승패는 done 뒤에만. 문항별 종목은 그대로 공개', () => {
  const { g, clock, ids } = setup(14, 4);
  g.startGame();
  for (let i = 0; i < 3; i++) {
    const r = playQuestion(g, clock, ids, ['O', 'O', 'X', null]);
    assert.equal(r.secret, true); assert.ok(r.teams && r.winner);   // 호스트(관리자 코어)는 다 가짐 → 엑셀·집계용
    const sv = g.studentView(ids[0]).result;
    assert.equal(sv.secret, true); assert.equal(sv.teams, undefined); assert.equal(sv.winner, undefined);
    assert.deepEqual(sv.answer, ['O']); assert.ok(sv.my);                 // 정답과 내 결과는 있음
    assert.deepEqual(Object.keys(sv.bundle).sort(), ['done', 'gauge', 'name', 'of', 'sport']);   // 누적 S 값 없음
    if (i < 2) g.next();
  }
  g.playScene();
  let sc = g.studentView(ids[0]).scene; assert.equal(sc.done, false); assert.equal(sc.winner, null); assert.equal(sc.result, null);
  g.sceneDone();
  sc = g.studentView(ids[0]).scene; assert.equal(sc.done, true); assert.ok(['rabbit', 'cat', 'draw'].includes(sc.winner)); assert.ok(sc.result.rabbit.label);
  g.next(); g.nextEvent();
  for (let no = 4; no <= 12; no++) { playQuestion(g, clock, ids, ['O', 'O', 'X', 'X']); if (g.canPlayScene()) { g.playScene(); g.sceneDone(); } g.next(); if (g.phase === 'EVENT_SUMMARY') g.nextEvent(); }
  const r = playQuestion(g, clock, ids, ['O', 'X', 'X', 'X']);   // 13번 = 양궁(문항별)
  assert.equal(r.secret, false); const sv = g.studentView(ids[0]).result; assert.ok(sv.teams.rabbit.T >= 0); assert.ok(typeof sv.winner === 'string');
});

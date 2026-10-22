/* 게임 진행 엔진 (명세서 4·5·8·9·11·12장). 호스트(교사 브라우저)가 들고 있는 기준 상태.
   시계(now)와 난수(random)를 주입받아 node:test에서도 그대로 돌릴 수 있다. */
import { TEAMS, TEAM_NAME, gradeQuestion, round1, GRACE_MS } from './scoring.js';
import { assignEvents, eventOfQuestion, eventWinner, finalTotals, sportById } from './events.js';
import { bundleRecord, perQuestionRecord, perQuestionTotals } from './sceneResults.js';
import { publicQuestion } from './questions.js';

export const PHASES = ['LOBBY', 'READY', 'QUESTION_OPEN', 'QUESTION_CLOSED', 'REVEAL', 'SCENE', 'EVENT_SUMMARY', 'FINAL'];
export const DEFAULT_SETTINGS = { studentNoLength: 5, eventBonus: 0, showTopContributors: false, autoAdvance: false, teamNames: { ...TEAM_NAME } };
const rid = (random, n = 10) => Array.from({ length: n }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(random() * 32)]).join('');

export class Game {
  constructor({ code, now = () => Date.now(), random = Math.random, state = null } = {}) {
    this.now = now; this.random = random;
    this.s = state || {
      code: code || String(1000 + Math.floor(random() * 9000)), createdAt: now(), phase: 'LOBBY',
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      questions: [], events: [], current: -1, started: false, ended: false,
      students: {}, seq: 1, results: [], eventResults: [], q: null, scene: null, summary: null, final: null, lastEvent: null
    };
  }
  get state() { return this.s; }
  get phase() { return this.s.phase; }
  get code() { return this.s.code; }
  get question() { return this.s.current >= 0 ? this.s.questions[this.s.current] : null; }
  teamName(t) { return (this.s.settings.teamNames || TEAM_NAME)[t] || TEAM_NAME[t]; }
  snapshot() { return JSON.parse(JSON.stringify(this.s)); }
  static restore(obj, opts = {}) { return new Game({ ...opts, state: JSON.parse(JSON.stringify(obj)) }); }

  // ───────── 준비 ─────────
  setQuestions(qs) {
    if (this.s.started) throw new Error('게임을 시작한 뒤에는 문항을 바꿀 수 없어요.');
    this.s.questions = qs.map((q, i) => ({ ...q, id: `q${i + 1}`, no: i + 1 }));
    this.s.events = assignEvents(this.s.questions.length);
  }
  setSettings(obj) { Object.assign(this.s.settings, obj || {}); }
  resetRoom() {
    const { code, settings, questions, events } = this.s;
    this.s = { ...new Game({ code, now: this.now, random: this.random }).s, settings, questions, events };
  }

  // ───────── 입장·팀 ─────────
  counts() { const c = { rabbit: 0, cat: 0 }; for (const st of Object.values(this.s.students)) if (!st.kicked) c[st.team]++; return c; }
  join({ studentNo, name, token, clientId }) {
    const len = this.s.settings.studentNoLength || 5;
    studentNo = String(studentNo || '').trim(); name = String(name || '').trim();
    if (!new RegExp(`^\\d{${len}}$`).test(studentNo)) return { error: `학번은 숫자 ${len}자리예요.` };
    if (!/^[가-힣A-Za-z][가-힣A-Za-z0-9 ]{0,9}$/.test(name) || name.replace(/\s/g, '').length < 2) return { error: '이름은 한글이나 영문 2~10자예요.' };
    let st = Object.values(this.s.students).find(x => x.studentNo === studentNo && !x.kicked);
    if (st) {
      const dup = st.connected && st.clientId && clientId && st.clientId !== clientId && token !== st.token;
      st.duplicate = !!dup; st.connected = true; st.clientId = clientId || st.clientId; st.name = name || st.name; st.lastSeen = this.now();
      return { student: st, reconnected: true };
    }
    const c = this.counts();
    const team = c.rabbit === c.cat ? (this.random() < 0.5 ? 'rabbit' : 'cat') : c.rabbit < c.cat ? 'rabbit' : 'cat';
    const id = `s${this.s.seq++}`;
    const joinedAtQuestion = !this.s.started ? 0 : this.s.phase === 'READY' ? this.s.current : this.s.current + 1;
    st = { id, studentNo, name, team, token: rid(this.random, 12), connected: true, clientId: clientId || null, joinedAt: this.now(), joinedAtQuestion, duplicate: false, kicked: false };
    this.s.students[id] = st;
    return { student: st, reconnected: false };
  }
  disconnect(clientId) { for (const st of Object.values(this.s.students)) if (st.clientId === clientId) { st.connected = false; st.duplicate = false; return st; } return null; }
  studentByClient(clientId) { return Object.values(this.s.students).find(st => st.clientId === clientId && !st.kicked) || null; }
  shuffleTeams() {
    if (this.s.started) throw new Error('게임 시작 뒤에는 팀을 다시 섞을 수 없어요.');
    const list = Object.values(this.s.students).filter(st => !st.kicked);
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    list.forEach((st, i) => { st.team = i % 2 === 0 ? 'rabbit' : 'cat'; });
  }
  moveStudent(id, team) { const st = this.s.students[id]; if (!st) return; st.team = team || (st.team === 'rabbit' ? 'cat' : 'rabbit'); }
  kick(id) { const st = this.s.students[id]; if (st) { st.kicked = true; st.connected = false; } }

  // ───────── 진행 ─────────
  startGame() {
    if (this.s.started) return;
    if (!this.s.questions.length) throw new Error('문항을 먼저 확정하세요.');
    if (!Object.values(this.s.students).some(st => !st.kicked)) throw new Error('학생이 1명 이상 입장해야 해요.');
    this.s.started = true; this.s.current = 0; this.s.phase = 'READY';
  }
  roster() {
    const r = { rabbit: [], cat: [] };
    for (const st of Object.values(this.s.students)) if (!st.kicked && st.joinedAtQuestion <= this.s.current) r[st.team].push(st.id);
    return r;
  }
  startQuestion() {
    if (this.s.phase !== 'READY') throw new Error('지금은 문제를 시작할 수 없어요.');
    const q = this.question, startedAt = this.now();
    this.s.q = { questionId: q.id, no: q.no, roster: this.roster(), startedAt, endsAt: startedAt + q.limit * 1000, limit: q.limit, answers: {}, closedAt: null, closedReason: null };
    this.s.phase = 'QUESTION_OPEN';
    return this.s.q;
  }
  questionPayload() {
    const q = this.question, rt = this.s.q; if (!q || !rt) return null;
    const info = eventOfQuestion(this.s.events, q.no);
    return { ...publicQuestion(q), startedAt: rt.startedAt, endsAt: rt.endsAt, serverNow: this.now(), limit: rt.limit,
      sport: info.ev.sport, sportName: info.ev.name, mode: info.ev.mode, indexInEvent: info.indexInEvent, ofInEvent: info.ofInEvent, total: this.s.questions.length };
  }
  submitAnswer(studentId, questionId, value) {
    const rt = this.s.q, st = this.s.students[studentId];
    if (!st || st.kicked) return { accepted: false, reason: 'unknown' };
    if (this.s.phase !== 'QUESTION_OPEN' || !rt || rt.questionId !== questionId) return { accepted: false, reason: 'closed' };
    const t = this.now();
    if (t > rt.endsAt + GRACE_MS) return { accepted: false, reason: 'late' };
    if (!rt.roster[st.team].includes(studentId)) return { accepted: false, reason: 'notInRoster' };
    if (rt.answers[studentId]) return { accepted: false, reason: 'dup' };
    if (typeof value === 'string' && value.length > 50) value = value.slice(0, 50);
    rt.answers[studentId] = { value, receivedAt: t };
    const total = rt.roster.rabbit.length + rt.roster.cat.length;
    const all = Object.keys(rt.answers).length >= total;
    if (all) this.closeQuestion('all');
    return { accepted: true, allSubmitted: all };
  }
  progress() {
    const rt = this.s.q; if (!rt) return null;
    const p = {};
    for (const t of TEAMS) p[t] = { submitted: rt.roster[t].filter(id => rt.answers[id]).length, total: rt.roster[t].length };
    return p;
  }
  closeQuestion(reason = 'manual') {
    if (this.s.phase !== 'QUESTION_OPEN') return;
    const rt = this.s.q, q = this.question;
    rt.closedAt = this.now(); rt.closedReason = reason;
    const g = gradeQuestion(q, rt.roster, rt.answers, { startedAt: rt.startedAt, endsAt: rt.endsAt, limit: rt.limit });
    const info = eventOfQuestion(this.s.events, q.no);
    rt.result = { questionId: q.id, no: q.no, sport: info.ev.sport, mode: info.ev.mode, roster: rt.roster, startedAt: rt.startedAt, endsAt: rt.endsAt, limit: rt.limit,
      answers: rt.answers, teams: g.teams, perStudent: g.perStudent, winner: g.winner, closedReason: reason };
    this.s.phase = 'QUESTION_CLOSED';
  }
  reveal() {
    if (this.s.phase !== 'QUESTION_CLOSED') throw new Error('먼저 마감해야 해요.');
    this.s.results.push(this.s.q.result);
    this.s.phase = 'REVEAL';
    return this.revealPayload();
  }
  bundleProgress(no) {
    const info = eventOfQuestion(this.s.events, no); if (!info || info.ev.mode !== 'bundle') return null;
    const ew = eventWinner(info.ev, this.s.results);
    return { sport: info.ev.sport, name: info.ev.name, gauge: sportById[info.ev.sport].gauge, done: ew.played, of: info.ev.count, S: ew.Tsum, max: 150 * info.ev.count };
  }
  revealPayload() {
    const r = this.s.q && this.s.q.result; const q = this.question; if (!r) return null;
    const info = eventOfQuestion(this.s.events, q.no);
    return { questionId: q.id, no: q.no, type: q.type, text: q.text, options: q.options, answer: q.answers, explanation: q.explanation, teams: r.teams, winner: r.winner,
      sport: info.ev.sport, sportName: info.ev.name, mode: info.ev.mode, indexInEvent: info.indexInEvent, ofInEvent: info.ofInEvent, isLast: info.isLast,
      bundle: this.bundleProgress(q.no), closedReason: r.closedReason, total: this.s.questions.length };
  }
  canPlayScene() {
    if (this.s.phase !== 'REVEAL') return false;
    const info = eventOfQuestion(this.s.events, this.question.no);
    return info.ev.mode === 'perQuestion' || info.isLast;
  }
  playScene() {
    if (!this.canPlayScene()) throw new Error('지금은 경기를 볼 수 없어요.');
    const q = this.question, info = eventOfQuestion(this.s.events, q.no), ev = info.ev, r = this.s.q.result;
    let scene;
    if (ev.mode === 'bundle') {
      const ew = eventWinner(ev, this.s.results);
      const rec = bundleRecord(ev.sport, ew.Tsum);
      scene = { sport: ev.sport, sceneType: sportById[ev.sport].scene, mode: 'bundle', index: 1, of: 1, questions: ew.questionNos, scores: ew.Tsum, winner: ew.winner, result: rec.result, finish: rec.finish || false, eventName: ev.name, count: ew.played };
    } else {
      const rec = perQuestionRecord(ev.sport, { rabbit: r.teams.rabbit.T, cat: r.teams.cat.T }, r.winner);
      r.record = rec;
      const prev = this.s.results.filter(x => x.sport === ev.sport && x.record);
      scene = { sport: ev.sport, sceneType: sportById[ev.sport].scene, mode: 'perQuestion', index: info.indexInEvent, of: info.ofInEvent, questions: [q.no], scores: rec.scores, winner: r.winner, result: rec.result,
        eventName: ev.name, totals: perQuestionTotals(prev.map(x => x.record)), wins: { rabbit: prev.filter(x => x.winner === 'rabbit').length, cat: prev.filter(x => x.winner === 'cat').length } };
    }
    this.s.scene = { ...scene, done: false, startedAt: this.now() };
    this.s.phase = 'SCENE';
    return this.s.scene;
  }
  sceneDone() { if (this.s.scene) this.s.scene.done = true; }
  next() {
    const ph = this.s.phase; if (ph !== 'REVEAL' && ph !== 'SCENE') throw new Error('지금은 다음 문제로 갈 수 없어요.');
    const q = this.question, info = eventOfQuestion(this.s.events, q.no);
    if (ph === 'REVEAL' && (info.ev.mode === 'perQuestion' || info.isLast)) throw new Error('먼저 [경기 보기]를 누르세요.');
    const last = this.s.current >= this.s.questions.length - 1;
    if (info.isLast || last) { this.finishEvent(info.ev); return this.s.phase; }
    this.s.current++; this.s.q = null; this.s.scene = null; this.s.phase = 'READY';
    return this.s.phase;
  }
  finishEvent(ev) {
    const ew = eventWinner(ev, this.s.results);
    const bundleScene = ev.mode === 'bundle' ? this.s.scene : null;
    const er = { ...ew, record: bundleScene ? bundleScene.result : null, finish: bundleScene ? bundleScene.finish : undefined,
      perQuestion: ev.mode === 'perQuestion' ? this.s.results.filter(x => x.sport === ev.sport).map(x => ({ no: x.no, winner: x.winner, T: { rabbit: x.teams.rabbit.T, cat: x.teams.cat.T }, record: x.record ? x.record.result : null })) : null,
      Ts: this.s.results.filter(x => x.sport === ev.sport).map(x => ({ no: x.no, rabbit: x.teams.rabbit.T, cat: x.teams.cat.T, winner: x.winner })) };
    if (er.perQuestion) er.recordTotals = perQuestionTotals(this.s.results.filter(x => x.sport === ev.sport && x.record).map(x => x.record));
    this.s.eventResults = this.s.eventResults.filter(e => e.sport !== ev.sport).concat([er]);
    this.s.lastEvent = er;
    this.s.summary = this.summaryPayload(er);
    this.s.phase = 'EVENT_SUMMARY';
  }
  summaryPayload(er) {
    const ft = finalTotals(this.s.results, this.s.eventResults, this.s.settings.eventBonus);
    const evIdx = this.s.events.findIndex(e => e.sport === er.sport);
    const nextEv = this.s.current < this.s.questions.length - 1 ? this.s.events[evIdx + 1] || null : null;
    const medals = { rabbit: this.s.eventResults.filter(e => e.winner === 'rabbit').map(e => e.sport), cat: this.s.eventResults.filter(e => e.winner === 'cat').map(e => e.sport) };
    return { event: er, totals: ft.totals, Tsum: ft.Tsum, diff: ft.diff, leader: ft.totals.rabbit === ft.totals.cat ? 'draw' : ft.totals.rabbit > ft.totals.cat ? 'rabbit' : 'cat', medals, bonus: ft.bonus,
      next: nextEv ? { sport: nextEv.sport, name: nextEv.name, from: nextEv.from, to: nextEv.to, count: nextEv.count, mode: nextEv.mode, play: sportById[nextEv.sport].play } : null, isFinal: !nextEv };
  }
  nextEvent() {
    if (this.s.phase !== 'EVENT_SUMMARY') throw new Error('종목 전환 화면이 아니에요.');
    if (this.s.current >= this.s.questions.length - 1) { this.finalize(); return 'FINAL'; }
    this.s.current++; this.s.q = null; this.s.scene = null; this.s.summary = null; this.s.phase = 'READY';
    return 'READY';
  }
  endGameInfo() {
    const remain = this.s.questions.length - 1 - this.s.current + (this.s.phase === 'REVEAL' || this.s.phase === 'SCENE' || this.s.phase === 'EVENT_SUMMARY' ? 0 : 1);
    const inProgress = this.s.phase === 'QUESTION_OPEN' || this.s.phase === 'QUESTION_CLOSED' ? this.question.no : null;
    return { remaining: Math.max(0, remain), inProgress };
  }
  endGame() {
    if (this.s.phase === 'LOBBY' || this.s.phase === 'FINAL') return;
    this.s.q = null; this.s.scene = null; this.s.summary = null; this.s.ended = true;
    this.finalize();
  }
  finalize() {
    const evs = this.s.events.map(ev => {
      const done = this.s.eventResults.find(e => e.sport === ev.sport);
      if (done && done.status === 'done') return done;
      const ew = eventWinner(ev, this.s.results);
      const Ts = this.s.results.filter(x => x.sport === ev.sport).map(x => ({ no: x.no, rabbit: x.teams.rabbit.T, cat: x.teams.cat.T, winner: x.winner }));
      const pq = ev.mode === 'perQuestion' ? this.s.results.filter(x => x.sport === ev.sport).map(x => ({ no: x.no, winner: x.winner, record: x.record ? x.record.result : null })) : null;
      return { ...ew, record: done ? done.record : null, perQuestion: pq, Ts, recordTotals: pq ? perQuestionTotals(this.s.results.filter(x => x.sport === ev.sport && x.record).map(x => x.record)) : undefined };
    });
    this.s.eventResults = evs;
    const ft = finalTotals(this.s.results, evs, this.s.settings.eventBonus);
    const students = this.studentSummaries();
    const top = {};
    for (const t of TEAMS) top[t] = students.filter(s => s.team === t).sort((a, b) => b.score - a.score).slice(0, 3).map(s => ({ name: s.name, studentNo: s.studentNo, score: s.score, correct: s.correct }));
    this.s.final = { ...ft, events: evs, played: this.s.results.length, total: this.s.questions.length, students, top, medals: { rabbit: evs.filter(e => e.winner === 'rabbit').map(e => e.sport), cat: evs.filter(e => e.winner === 'cat').map(e => e.sport) }, endedAt: this.now() };
    this.s.phase = 'FINAL'; this.s.ended = true;
  }
  studentSummaries() {
    return Object.values(this.s.students).filter(st => !st.kicked).map(st => {
      let correct = 0, score = 0, timeSum = 0, played = 0;
      const perQ = this.s.results.map(r => { const p = r.perStudent[st.id]; if (!p) return null; played++; if (p.correct) { correct++; timeSum += p.time; } score = round1(score + p.score); return p; });
      return { id: st.id, studentNo: st.studentNo, name: st.name, team: st.team, correct, played, score, avgTime: correct ? round1(timeSum / correct) : null, perQ };
    }).sort((a, b) => a.studentNo.localeCompare(b.studentNo));
  }

  // ───────── 화면용 상태 ─────────
  adminView() {
    const s = this.s, q = this.question;
    return { code: s.code, phase: s.phase, settings: s.settings, started: s.started, ended: s.ended, current: s.current, total: s.questions.length,
      questions: s.questions, events: s.events, students: Object.values(s.students).filter(st => !st.kicked), counts: this.counts(),
      question: s.phase === 'QUESTION_OPEN' || s.phase === 'QUESTION_CLOSED' ? this.questionPayload() : q && s.phase === 'READY' ? { ...publicQuestion(q), ...eventOfQuestion(s.events, q.no), total: s.questions.length } : null,
      progress: this.progress(), closedReason: s.q && s.q.closedReason, closedAt: s.q && s.q.closedAt,
      reveal: s.phase === 'REVEAL' || s.phase === 'SCENE' ? this.revealPayload() : null, canPlayScene: this.canPlayScene(),
      scene: s.scene, summary: s.summary, final: s.final, results: s.results.map(r => ({ no: r.no, sport: r.sport, teams: r.teams, winner: r.winner })), eventResults: s.eventResults,
      lastReveal: this.s.q && this.s.q.result ? this.revealPayload() : null, now: this.now() };
  }
  studentView(studentId) {
    const s = this.s, st = s.students[studentId]; if (!st) return null;
    const counts = this.counts();
    const v = { phase: s.phase, code: s.code, me: { id: st.id, studentNo: st.studentNo, name: st.name, team: st.team, teamName: this.teamName(st.team) }, counts, teamNames: { rabbit: this.teamName('rabbit'), cat: this.teamName('cat') }, now: this.now(), total: s.questions.length };
    if (s.phase === 'READY' && this.question) { const q = this.question, info = eventOfQuestion(s.events, q.no); v.ready = { no: q.no, sportName: info.ev.name, sport: info.ev.sport, indexInEvent: info.indexInEvent, ofInEvent: info.ofInEvent, mode: info.ev.mode, waiting: st.joinedAtQuestion > s.current }; }
    if (s.phase === 'QUESTION_OPEN' || s.phase === 'QUESTION_CLOSED') {
      v.question = this.questionPayload();
      const rt = s.q; v.question.inRoster = rt.roster[st.team].includes(st.id); v.question.myAnswer = rt.answers[st.id] ? rt.answers[st.id].value : null;
      v.question.closed = s.phase === 'QUESTION_CLOSED'; v.question.closedReason = rt.closedReason;
    }
    if (s.phase === 'REVEAL' || s.phase === 'SCENE') {
      const r = s.q.result, me = r.perStudent[st.id];
      v.result = { ...this.revealPayload(), my: me ? { submitted: me.submitted, correct: me.correct, score: me.score, value: me.value } : null };
    }
    if (s.phase === 'SCENE') v.scene = { sport: s.scene.sport, eventName: s.scene.eventName, mode: s.scene.mode, index: s.scene.index, of: s.scene.of, winner: s.scene.winner, scores: s.scene.scores, result: s.scene.result, done: s.scene.done };
    if (s.phase === 'EVENT_SUMMARY') v.summary = s.summary;
    if (s.phase === 'FINAL') { const f = s.final; const mine = f.students.find(x => x.id === st.id); v.final = { totals: f.totals, winner: f.winner, diff: f.diff, medals: f.medals, played: f.played, events: f.events.map(e => ({ sport: e.sport, name: e.name, winner: e.winner, status: e.status })), my: mine ? { correct: mine.correct, played: mine.played, score: mine.score, avgTime: mine.avgTime } : null }; }
    return v;
  }
}

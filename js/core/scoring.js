/* 채점·점수 계산 (명세서 8장) — 브라우저(호스트)와 node:test 양쪽에서 쓰는 순수 함수 */
export const TEAMS = ['rabbit', 'cat'];
export const TEAM_NAME = { rabbit: '토끼팀', cat: '고양이팀' };
export const TEAM_COLOR = { rabbit: '#ff8fb6', cat: '#ffa64d' };
export const DEFAULT_LIMIT = { ox: 15, choice: 20, short: 40 };
export const GRACE_MS = 500;            // 마감 뒤 네트워크 지연 여유
export const round1 = v => Math.round((Number(v) || 0) * 10) / 10;
export const other = t => (t === 'rabbit' ? 'cat' : 'rabbit');

/** 8.1 학생 문항 점수 : 정답이면 100 + 50 × (남은 시간 ÷ 제한 시간), 아니면 0 */
export function studentScore(correct, remainingMs, limitMs) {
  if (!correct) return 0;
  const r = Math.max(0, Math.min(1, (remainingMs || 0) / (limitMs || 1)));
  return round1(100 + 50 * r);
}

/** 8.4 주관식 정규화 : NFC, 앞뒤 공백, 모든 띄어쓰기, 소문자, 문장 부호 */
export function normalizeAnswer(s) {
  return String(s ?? '').normalize('NFC').trim().replace(/\s+/g, '').toLowerCase().replace(/[.,·\-'"’‘“”]/g, '');
}

/** 8.4 글자 수 힌트 : 띄어쓰기는 두고 나머지 글자는 ㅁ */
export function hintOf(answer) {
  const a = String(answer ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  const hint = [...a].map(ch => (ch === ' ' ? ' ' : 'ㅁ')).join('');
  const parts = a ? a.split(' ').map(w => [...w].length) : [];
  return { hint, parts, label: parts.length ? `${hint} (${parts.map(n => n + '글자').join(' · ')})` : '' };
}

/** 문항·답안으로 정답 여부 판정 */
export function isCorrect(q, value) {
  if (value == null || value === '') return false;
  if (q.type === 'ox') return String(value).trim().toUpperCase() === String(q.answers[0]).trim().toUpperCase();
  if (q.type === 'choice') return Number(value) === Number(q.answers[0]);
  const v = normalizeAnswer(value);
  return v.length > 0 && q.answers.some(a => normalizeAnswer(a) === v);
}

/** 8.3 문항 승리 팀 : T → 정답률 → 평균 정답 시간(짧은 쪽) → 가장 먼저 정답 제출 → 무승부. 두 팀 모두 T=0이면 무승부 */
export function questionWinner(teams) {
  const a = teams.rabbit, b = teams.cat;
  if (a.T === 0 && b.T === 0) return 'draw';
  if (a.T !== b.T) return a.T > b.T ? 'rabbit' : 'cat';
  if (a.correctRate !== b.correctRate) return a.correctRate > b.correctRate ? 'rabbit' : 'cat';
  const at = a.avgTime ?? Infinity, bt = b.avgTime ?? Infinity;
  if (at !== bt) return at < bt ? 'rabbit' : 'cat';
  const af = a.firstCorrectAt ?? Infinity, bf = b.firstCorrectAt ?? Infinity;
  if (af !== bf) return af < bf ? 'rabbit' : 'cat';
  return 'draw';
}

/**
 * 한 문항 채점. roster = { rabbit:[studentId], cat:[studentId] } (문제 시작 때의 팀 인원),
 * answers = { [studentId]: { value, receivedAt } }, timing = { startedAt, endsAt, limit(초) }
 */
export function gradeQuestion(q, roster, answers, timing) {
  const limitMs = timing.limit * 1000;
  const perStudent = {};
  const teams = {};
  for (const team of TEAMS) {
    const ids = roster[team] || [];
    let sum = 0, correct = 0, timeSum = 0, firstCorrectAt = null;
    for (const id of ids) {
      const a = answers[id];
      let rec = { studentId: id, team, value: null, correct: false, score: 0, time: null, submitted: false };
      if (a && a.receivedAt <= timing.endsAt + GRACE_MS) {
        const ok = isCorrect(q, a.value);
        const remaining = Math.max(0, timing.endsAt - a.receivedAt);
        const score = studentScore(ok, remaining, limitMs);
        const time = round1(Math.max(0, (a.receivedAt - timing.startedAt) / 1000));
        rec = { studentId: id, team, value: a.value, correct: ok, score, time, submitted: true };
        sum += score;
        if (ok) { correct++; timeSum += time; if (firstCorrectAt == null || a.receivedAt < firstCorrectAt) firstCorrectAt = a.receivedAt; }
      }
      perStudent[id] = rec;
    }
    const total = ids.length;
    teams[team] = {
      T: total ? round1(sum / total) : 0,
      correct, total,
      correctRate: total ? Math.round(correct / total * 1000) / 10 : 0,
      avgTime: correct ? round1(timeSum / correct) : null,
      firstCorrectAt
    };
  }
  return { teams, perStudent, winner: questionWinner(teams) };
}

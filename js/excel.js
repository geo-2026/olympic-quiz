/* 엑셀 읽기·쓰기 (SheetJS, 브라우저 전용) — 문항 업로드, 양식 내려받기, 결과 내보내기 (명세서 6·12.3) */
import { parseSheets, validate, toQuestions, TEMPLATE_HEADER, TEMPLATE_ROWS, TYPE_NAME, answerText } from './core/questions.js';
import { TEAM_NAME } from './core/scoring.js';
import { sportById } from './core/events.js';

/** File → { parsed, errors, questions } */
export async function readQuestionFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', codepage: 65001 });
  const sheets = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true }) }));
  const parsed = parseSheets(sheets);
  const errors = validate(parsed);
  return { parsed, errors, questions: errors ? null : toQuestions(parsed), sheetNames: wb.SheetNames };
}
export function rowsToQuestions(sheets) { const parsed = parseSheets(sheets); const errors = validate(parsed); return { parsed, errors, questions: errors ? null : toQuestions(parsed) }; }

export function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADER, ...TEMPLATE_ROWS]);
  ws['!cols'] = [6, 8, 60, 18, 18, 18, 18, 16, 50, 12, 10, 24].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '문항');
  XLSX.writeFile(wb, '문항_양식.xlsx');
}

const teamName = (names, t) => (names && names[t]) || TEAM_NAME[t];
const mark = p => (!p ? '미참여' : !p.submitted ? '미제출' : p.correct ? '○' : '×');
const recLabel = (e, t) => {
  if (!e) return '';
  if (e.mode === 'bundle') return e.record ? e.record[t].label : '';
  return e.recordTotals ? String(e.recordTotals[t]) : '';
};

/** 최종 결과 엑셀 : 요약 · 학생별 · 문항별 · 종목별 */
export function exportResults(state) {
  const f = state.final, names = state.settings.teamNames;
  const date = new Date(f.endedAt || Date.now());
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const W = t => (t === 'draw' ? '무승부' : teamName(names, t));
  const summary = [
    ['항목', '내용'], ['날짜', ymd], ['방 코드', state.code], ['문항 수', state.questions.length], ['진행 문항 수', f.played],
    [`${teamName(names, 'rabbit')} 최종 합계`, f.totals.rabbit], [`${teamName(names, 'cat')} 최종 합계`, f.totals.cat], ['종목 승리 보너스(점)', f.bonus], ['우승 팀', W(f.winner)],
    ['', ''], ['종목', '승리 팀'], ...f.events.map(e => [e.name, e.status === 'notPlayed' ? '미진행' : W(e.winner) + (e.status === 'partial' ? ` (부분 진행 ${e.played}/${e.count}문항)` : '')])
  ];
  const qs = state.questions.slice(0, f.played);
  const stuHead = ['학번', '이름', '팀', ...qs.map(q => `${q.no}번 정오`), ...qs.map(q => `${q.no}번 점수`), '정답 수', '평균 정답 시간(초)', '합계'];
  const students = f.students.map(s => [s.studentNo, s.name, teamName(names, s.team), ...qs.map((q, i) => mark(s.perQ[i])), ...qs.map((q, i) => (s.perQ[i] ? s.perQ[i].score : '')), s.correct, s.avgTime ?? '', s.score]);
  const rsBy = Object.fromEntries(state.results.map(r => [r.no, r]));
  const qrows = qs.map(q => { const r = rsBy[q.no]; const all = r ? r.teams.rabbit.correct + r.teams.cat.correct : 0, tot = r ? r.teams.rabbit.total + r.teams.cat.total : 0;
    return [q.no, TYPE_NAME[q.type], q.text, answerText(q), tot ? Math.round(all / tot * 1000) / 10 : '', r ? r.teams.rabbit.correctRate : '', r ? r.teams.rabbit.avgTime ?? '' : '', r ? r.teams.rabbit.T : '', r ? r.teams.cat.correctRate : '', r ? r.teams.cat.avgTime ?? '' : '', r ? r.teams.cat.T : '', r ? W(r.winner) : '', sportById[r ? r.sport : q.sport || 'tug'] ? sportById[r.sport].name : '']; });
  const qHead = ['번호', '유형', '문제', '정답', '전체 정답률(%)', `${teamName(names, 'rabbit')} 정답률(%)`, `${teamName(names, 'rabbit')} 평균 시간`, `${teamName(names, 'rabbit')} T`, `${teamName(names, 'cat')} 정답률(%)`, `${teamName(names, 'cat')} 평균 시간`, `${teamName(names, 'cat')} T`, '문항 승리 팀', '종목'];
  const eHead = ['종목', '문항 범위', '방식', `${teamName(names, 'rabbit')} T 합(S)`, `${teamName(names, 'cat')} T 합(S)`, `${teamName(names, 'rabbit')} 승 수`, `${teamName(names, 'cat')} 승 수`, `${teamName(names, 'rabbit')} 경기 기록`, `${teamName(names, 'cat')} 경기 기록`, '종목 승리 팀', '상태'];
  const erows = f.events.map(e => [e.name, `${e.from}~${e.to}`, e.mode === 'bundle' ? '묶음(합산 1회)' : '문항별', e.Tsum.rabbit, e.Tsum.cat, e.mode === 'perQuestion' ? e.wins.rabbit : '', e.mode === 'perQuestion' ? e.wins.cat : '', recLabel(e, 'rabbit'), recLabel(e, 'cat'), e.status === 'notPlayed' ? '' : W(e.winner), e.status === 'done' ? '완료' : e.status === 'partial' ? `부분 진행(${e.played}/${e.count}문항)` : '미진행']);
  const wb = XLSX.utils.book_new();
  const add = (name, rows, cols) => { const ws = XLSX.utils.aoa_to_sheet(rows); if (cols) ws['!cols'] = cols.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add('요약', summary, [22, 40]); add('학생별', [stuHead, ...students], [8, 10, 8]); add('문항별', [qHead, ...qrows], [5, 8, 50, 20]); add('종목별', [eHead, ...erows], [10, 10, 14]);
  XLSX.writeFile(wb, `형성평가결과_${state.code}_${ymd}.xlsx`);
}

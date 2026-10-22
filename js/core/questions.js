/* 문항 표(엑셀) 읽기·검증·양식 (명세서 6장). 2차원 배열(행 = 배열)만 다루므로 브라우저·node 양쪽에서 테스트 가능 */
import { DEFAULT_LIMIT, hintOf } from './scoring.js';

const norm = s => String(s ?? '').normalize('NFC').replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();
const HEAD = {
  no: ['번호', 'no', 'num', '순서'],
  type: ['유형', '문제유형', 'type'],
  text: ['문제', '문항', '질문', 'question', '문제내용'],
  o1: ['보기1', '보기①', '①', 'option1', '선택지1'], o2: ['보기2', '보기②', '②', 'option2', '선택지2'],
  o3: ['보기3', '보기③', '③', 'option3', '선택지3'], o4: ['보기4', '보기④', '④', 'option4', '선택지4'],
  answer: ['정답', 'answer', '답'],
  explanation: ['해설', '설명', 'explanation', '풀이'],
  limit: ['제한시간', '시간', 'limit', 'time', '제한시간초'],
  hint: ['글자수힌트', '힌트', 'hint', '글자수'],
  image: ['이미지주소', '이미지', 'image', 'imageurl', '그림']
};
export function typeOf(v) {
  const s = norm(v);
  if (!s) return null;
  if (/^ox$|^o\/x$|^ox형$|^진위/.test(s)) return 'ox';
  if (/선다|객관|선택|choice|multiple/.test(s)) return 'choice';
  if (/주관|단답|short|서술|쓰기/.test(s)) return 'short';
  return null;
}
export function typeOfSheetName(name) { return typeOf(name); }

function mapHeader(row) {
  const idx = {};
  row.forEach((h, i) => { const n = norm(h); if (!n) return; for (const [k, names] of Object.entries(HEAD)) if (idx[k] == null && names.map(norm).includes(n)) idx[k] = i; });
  return idx;
}
const cell = (row, i) => (i == null ? '' : String(row[i] ?? '').trim());

/**
 * 시트 하나(2차원 배열, 1행 머리글) → 문항 배열(검증 전). typeHint = 시트 이름으로 추정한 유형
 * 반환 요소 : { row, no, type, text, options, answerRaw, explanation, limit, showHint, image, errors:[] }
 */
export function parseSheet(rows, typeHint = null, startNo = 1) {
  if (!rows || !rows.length) return [];
  const idx = mapHeader(rows[0]);
  if (idx.text == null) return [];
  const out = [];
  let no = startNo;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row.some(c => String(c ?? '').trim() !== '')) continue;
    const text = cell(row, idx.text);
    const options = [idx.o1, idx.o2, idx.o3, idx.o4].map(i => cell(row, i)).filter(Boolean);
    const answerRaw = cell(row, idx.answer);
    const typeCell = idx.type != null ? cell(row, idx.type) : '';
    let type = typeCell ? typeOf(typeCell) : null;
    const typeUnknown = !!typeCell && !type;
    if (!type && !typeUnknown) type = typeHint;
    if (!type && !typeUnknown) { // 열 내용으로 추정
      if (options.length >= 2) type = 'choice';
      else if (/^[ox]$/i.test(answerRaw)) type = 'ox';
      else type = 'short';
    }
    const q = {
      row: r + 1, no: idx.no != null && cell(row, idx.no) !== '' ? Number(cell(row, idx.no)) : no,
      type, text, options, answerRaw, explanation: cell(row, idx.explanation),
      limit: cell(row, idx.limit) === '' ? null : Number(String(cell(row, idx.limit)).replace(/[^\d.]/g, '')),
      showHint: !/^n|^아니|^x|^off|^false|^0/i.test(cell(row, idx.hint)),
      image: cell(row, idx.image), errors: []
    };
    out.push(q); no++;
  }
  return out;
}

/** 여러 시트 → 하나의 문항 목록. sheets = [{ name, rows }]. ‘유형’ 열이 없으면 시트 이름으로 유형을 정함(OX·선택형·단답형 시트) */
export function parseSheets(sheets) {
  let all = [];
  for (const sh of sheets) {
    const rows = sh.rows || [];
    if (!rows.length) continue;
    const idx = mapHeader(rows[0]);
    if (idx.text == null) continue;
    const hasType = idx.type != null;
    const qs = parseSheet(rows, hasType ? null : typeOfSheetName(sh.name), all.length + 1);
    qs.forEach(q => { q.sheet = sh.name; });
    all = all.concat(qs);
  }
  // 번호 열이 있으면 그 순서로, 없으면 시트 순서대로
  if (all.some(q => Number.isFinite(q.no))) all.sort((a, b) => (a.no || 0) - (b.no || 0));
  all.forEach((q, i) => { q.no = i + 1; });
  return all;
}

/** 검증 → 오류 메시지 채움. 반환: 오류 수 */
export function validate(qs) {
  let n = 0;
  for (const q of qs) {
    const e = [];
    if (!q.type) e.push('유형을 알 수 없음');
    if (!q.text) e.push('문제가 비어 있음');
    if (q.type === 'choice') {
      if (q.options.length !== 4) e.push(`보기가 ${q.options.length}개 (4개 필요)`);
      const a = q.answerRaw;
      let ai = /^[1-4]$/.test(a) ? Number(a) : /^[①②③④]$/.test(a) ? '①②③④'.indexOf(a) + 1 : q.options.findIndex(o => o === a) + 1;
      if (!(ai >= 1 && ai <= 4)) e.push('정답이 1~4 범위를 벗어남');
      else q.answers = [ai];
    } else if (q.type === 'ox') {
      const a = q.answerRaw.toUpperCase().replace('0', 'O');
      if (!/^[OX]$/.test(a)) e.push('OX 정답이 O/X가 아님'); else q.answers = [a];
    } else if (q.type === 'short') {
      const ans = q.answerRaw.split('|').map(s => s.trim()).filter(Boolean);
      if (!ans.length) e.push('정답이 비어 있음'); else q.answers = ans;
    }
    if (q.limit != null && (!Number.isFinite(q.limit) || q.limit < 5 || q.limit > 120)) e.push('제한 시간은 5~120초');
    if (q.image && !/^https:\/\//.test(q.image)) e.push('이미지 주소는 https로 시작');
    q.errors = e; if (e.length) n++;
  }
  return n;
}

/** 검증 통과한 문항 → 게임용 Question 객체 */
export function toQuestions(qs) {
  return qs.map((q, i) => ({
    id: `q${i + 1}`, no: i + 1, type: q.type, text: q.text,
    options: q.type === 'choice' ? q.options.slice(0, 4) : [],
    answers: q.answers, explanation: q.explanation || '',
    limit: q.limit ?? DEFAULT_LIMIT[q.type], showHint: q.type === 'short' ? q.showHint !== false : false,
    image: q.image || ''
  }));
}

/** 학생에게 보내는 문항(정답·해설 없음) */
export function publicQuestion(q) {
  const p = { id: q.id, no: q.no, type: q.type, text: q.text, options: q.options, limit: q.limit, image: q.image };
  if (q.type === 'short' && q.showHint) p.hint = hintOf(q.answers[0]);
  return p;
}
export const TYPE_NAME = { ox: 'OX', choice: '4지 선다', short: '주관식' };
export const answerText = q => (q.type === 'choice' ? `${'①②③④'[q.answers[0] - 1]} ${q.options[q.answers[0] - 1] || ''}` : q.answers.join(' / '));

/** 6.3 엑셀 양식(머리글 + 부록 A 예시) */
export const TEMPLATE_HEADER = ['번호', '유형', '문제', '보기1', '보기2', '보기3', '보기4', '정답', '해설', '제한시간(초)', '글자수힌트', '이미지주소'];
export const TEMPLATE_ROWS = [
  [1, 'OX', '참정권은 국가에 대해 일정한 행위를 해 달라고 요구할 수 있는 권리이다.', '', '', '', '', 'X', '국가에 요구하는 권리는 청구권이다. 참정권은 정치 과정에 참여하는 권리이다.', '', '', ''],
  [2, '선다', '다음 중 사회권에 해당하는 것은?', '교육을 받을 권리', '선거권', '재판 청구권', '신체의 자유', '1', '사회권은 인간다운 생활을 보장받을 권리이다.', '', '', ''],
  [3, '주관식', '인간이 인간답게 살기 위해 누려야 할 기본적인 권리를 무엇이라고 하는가?', '', '', '', '', '인권', '힌트: ㅁㅁ', '', 'Y', ''],
  [4, 'OX', '시민 불복종은 정의롭지 못한 법이나 정책에 대해 비폭력적이고 공개적으로 저항하는 행위이다.', '', '', '', '', 'O', '공익성, 비폭력성, 처벌 감수 등의 조건이 따른다.', '', '', ''],
  [5, '주관식', '공권력의 행사나 불행사로 기본권을 침해당한 사람이 헌법 재판소에 구제를 청구하는 제도는?', '', '', '', '', '헌법 소원|헌법소원', '힌트: ㅁㅁ ㅁㅁ', '', 'Y', ''],
  [6, '선다', '헌법 제37조 제2항에 규정된 기본권 제한의 목적이 아닌 것은?', '국가 안전 보장', '질서 유지', '공공복리', '경제 성장', '4', '국가 안전 보장, 질서 유지, 공공복리를 위해 필요한 경우에 한해 법률로 제한할 수 있다.', '', '', '']
];

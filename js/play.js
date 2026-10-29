/* 학생 화면 — 호스트(교사 브라우저)가 보내는 상태(view)만 그린다 */
import { ClientNet, detectTransport } from './net.js';
import { GameAudio } from './audio.js';
import { Timer } from './timer.js';
import { faceImg } from './faces.js';
import { sportById } from './core/events.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt1 = v => (v == null ? '—' : Number(v).toFixed(1));
const Q = new URLSearchParams(location.search);
const transport = detectTransport();
const audio = new GameAudio();
let net = null, me = null, view = null, timer = null, saved = null, draft = { questionId: null, value: null, sent: false, locked: false };
const played = { result: null, final: false, summary: null };   // 소리를 한 번만 내기 위한 기억
const TN = t => (view && view.teamNames ? view.teamNames[t] : t === 'rabbit' ? '토끼팀' : '고양이팀');
const face = (t, s = 40) => faceImg(t, s);

// 신원(방·학번·토큰)은 탭별 sessionStorage에, 학번·이름 미리 채우기는 localStorage에 저장
function load() { try { saved = JSON.parse(sessionStorage.getItem('olq:student') || 'null'); } catch (e) { saved = null; } if (!saved) { try { const p = JSON.parse(localStorage.getItem('olq:student:prefill') || 'null'); if (p) saved = { studentNo: p.studentNo, name: p.name }; } catch (e) { } } }
function save() { try { sessionStorage.setItem('olq:student', JSON.stringify(saved)); if (saved && saved.studentNo) localStorage.setItem('olq:student:prefill', JSON.stringify({ studentNo: saved.studentNo, name: saved.name })); } catch (e) { } }
function setNet(s, reason) {
  const el = $('net'); el.className = s === 'open' ? 'open' : s === 'closed' ? 'bad' : '';
  el.textContent = s === 'open' ? '연결됨' : s === 'connecting' ? '연결 중…' : reason === 'no-host' ? '선생님 화면을 찾는 중…' : '끊김 · 다시 연결 중';
}
let toastT = null;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }

/* ───────── 연결·입장 ───────── */
function connect(code) {
  if (net) net.close();
  net = new ClientNet({ code, transport });
  net.on('status', (s, r) => { setNet(s, r); if (s === 'open') { if (saved && saved.room === code && saved.studentNo) sendJoin(saved.studentNo, saved.name, saved.token); } if (s === 'closed' && me) overlay('연결이 끊겼어요', '다시 연결하는 중… 잠시 기다려 주세요. 안 되면 새로 고침하세요.'); })
    .on('retry', ms => { })
    .on('message', onMessage);
  net.connect();
}
function sendJoin(studentNo, name, token) { net.send({ type: 'join', roomCode: saved.room, studentNo, name, token }); }
function onMessage(m) {
  if (!m) return;
  if (m.type === 'joined') { me = m.me; saved = { room: saved.room, studentNo: me.studentNo, name: me.name, token: me.token }; save(); hideOverlay(); applyView(m.view); }
  else if (m.type === 'joinError') { me = null; renderJoin(m.error); }
  else if (m.type === 'state') { if (me) applyView(m.view); }
  else if (m.type === 'ack') { if (m.questionId === draft.questionId) { if (m.accepted) { draft.locked = true; } else { draft.sent = false; if (m.reason === 'late' || m.reason === 'closed') { draft.locked = true; toast('시간이 끝나 제출되지 않았어요.'); } else if (m.reason === 'dup') draft.locked = true; else toast('제출되지 않았어요.'); } render(); } }
  else if (m.type === 'kicked') { me = null; saved = null; save(); net.close(); overlay('방에서 나갔어요', '선생님이 방을 초기화했거나 내보냈어요. 다시 입장하려면 새로 고침하세요.'); }
}
function applyView(v) {
  view = v; document.body.className = 'team-' + v.me.team;
  $('me').innerHTML = `${face(v.me.team, 22)} ${esc(v.me.name)} · <span class="${v.me.team === 'rabbit' ? 'r' : 'c'}">${esc(TN(v.me.team))}</span>`;
  if (v.question && v.question.id !== draft.questionId) draft = { questionId: v.question.id, value: null, sent: false, locked: false };
  if (v.question && v.question.myAnswer != null) { draft.value = v.question.myAnswer; draft.locked = true; }
  render();
}
function overlay(title, text) { $('overlay').innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`; $('overlay').hidden = false; }
function hideOverlay() { $('overlay').hidden = true; }

/* ───────── 화면 ───────── */
function render() {
  const root = $('view');
  if (!me || !view) return;
  const v = view, p = v.phase;
  if (p !== 'QUESTION_OPEN') stopTimer();
  if (p === 'LOBBY') root.innerHTML = `<div class="hero"><div class="faces">${face(v.me.team, 96)}</div><h2>당신은 <span class="${v.me.team === 'rabbit' ? 'r' : 'c'}">${esc(TN(v.me.team))}</span>이에요!</h2><p>팀원 ${v.counts[v.me.team]}명 · 상대 팀 ${v.counts[v.me.team === 'rabbit' ? 'cat' : 'rabbit']}명</p><p class="muted">선생님이 게임을 시작할 때까지 기다려 주세요.</p></div>`;
  else if (p === 'READY') { const r = v.ready; const sub = r.mode === 'bundle' ? `문항 ${r.indexInEvent}/${r.ofInEvent}` : r.mode === 'perShot' ? `${r.shotIndex}발/${r.totalShots}발 · 문항 ${r.indexInShot}/${r.questionsPerShot}` : `${r.indexInEvent}/${r.ofInEvent}발`; root.innerHTML = `<div class="hero">${face(v.me.team, 72)}<h2>${r.no}번 문항</h2><p class="mono" style="color:var(--cyan)">${sportById[r.sport].icon} ${esc(r.sportName)} ${sub}</p><p class="muted">${r.waiting ? '이번 문항은 쉬고 다음 문항부터 참여해요.' : '곧 문제가 나와요. 준비!'}</p></div>`; }
  else if (p === 'QUESTION_OPEN' || p === 'QUESTION_CLOSED') renderQuestion(v);
  else if (p === 'REVEAL' || p === 'SCENE') renderResult(v);
  else if (p === 'EVENT_SUMMARY') renderSummary(v.summary);
  else if (p === 'FINAL') renderFinal(v.final);
}
function renderQuestion(v) {
  const q = v.question, open = v.phase === 'QUESTION_OPEN';
  const label = q.mode === 'bundle' ? `${esc(q.sportName)} 문항 ${q.indexInEvent}/${q.ofInEvent}` : q.mode === 'perShot' ? `${esc(q.sportName)} ${q.shotIndex}발/${q.totalShots}발 · 문항 ${q.indexInShot}/${q.questionsPerShot}` : `${esc(q.sportName)} ${q.indexInEvent}/${q.ofInEvent}발`;
  let body = `<div class="qhead"><span class="no">${q.no}번</span><span class="sport">${sportById[q.sport].icon} ${label}</span></div>
    <div class="timerwrap"><div class="tnum" id="tnum">${q.limit}</div><div class="tbar"><i id="tbar"></i></div></div>
    <div class="qtext">${esc(q.text)}</div>${q.image ? `<img class="qimg" src="${esc(q.image)}" alt="">` : ''}`;
  if (!q.inRoster) body += `<div class="locked">이번 문항은 쉬어요<b>다음 문항부터</b></div>`;
  else if (draft.locked || !open) body += draft.locked ? `<div class="locked">제출 완료<b>결과를 기다려요</b><span class="muted">내 답 : ${esc(fmtAnswer(q, draft.value))}</span></div>` : `<div class="locked" style="border-color:var(--no)">시간 종료!<b>제출하지 못했어요</b></div>`;
  else {
    if (q.type === 'ox') body += `<div class="answers ox"><button class="abtn" data-v="O">O</button><button class="abtn" data-v="X">X</button></div>`;
    else if (q.type === 'choice') body += `<div class="answers">${q.options.map((o, i) => `<button class="abtn" data-v="${i + 1}"><span class="n">${'①②③④'[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>`;
    else body += `${q.hint ? `<div class="hint">${esc(q.hint.hint)}<small>정답 글자 수 (${q.hint.parts.map(n => n + '글자').join(' · ')})</small></div>` : ''}<div class="shortrow"><input id="shortIn" maxlength="50" placeholder="정답을 입력" autocomplete="off" enterkeyhint="send"><button class="btn primary" id="shortGo">제출</button></div>`;
  }
  $('view').innerHTML = body;
  $('view').querySelectorAll('.abtn').forEach(b => b.onclick = () => submit(b.dataset.v, b));
  const si = $('shortIn'); if (si) { si.focus(); si.addEventListener('keydown', e => { if (e.key === 'Enter') submit(si.value); }); $('shortGo').onclick = () => submit(si.value); }
  if (open) { if (!timer || timer.startedAt !== q.startedAt) { timer = new Timer({ num: $('tnum'), bar: $('tbar'), root: document.body, count: $('countdown') }, audio.enabled ? audio : null, { vibrate: true, qtype: q.type, submitted: () => draft.locked, onEnd: () => { if (!draft.locked) { draft.locked = true; render(); } } }); timer.sync(q.serverNow); timer.start(q.startedAt, q.endsAt); } else { timer.el.num = $('tnum'); timer.el.bar = $('tbar'); } }
  else stopTimer();
}
function fmtAnswer(q, v) { if (v == null) return '—'; if (q.type === 'choice') return '①②③④'[Number(v) - 1] || v; return v; }
function submit(value, btn) {
  if (draft.locked || draft.sent) return;
  value = String(value ?? '').trim(); if (!value) { toast('답을 입력하세요.'); return; }
  draft.value = value; draft.sent = true; draft.locked = true;
  if (btn) btn.classList.add('sel');
  if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { } }
  audio.click();
  net.send({ type: 'answer', questionId: draft.questionId, answer: value });
  render();
}
function stopTimer() { if (timer) { timer.stop(); timer = null; } document.body.classList.remove('t-green', 't-yellow', 't-orange', 't-red', 't-last3', 't-over', 't-submitted'); $('countdown').textContent = ''; }
function renderResult(v) {
  const r = v.result, my = r.my, t = v.me.team;
  if (played.result !== r.no) { played.result = r.no; if (my && my.submitted) { if (my.correct) audio.correct(); else audio.wrong(); } }
  const mine = !my ? `<div class="result"><div class="muted">이번 문항은 참여하지 않았어요</div></div>` : `<div class="result"><div class="mark ${my.correct ? 'ok' : 'no'}">${my.correct ? '○' : '×'}</div><div class="score">${my.correct ? '+' + fmt1(my.score) : '0.0'}점</div><div class="muted">${my.submitted ? '내 답 : ' + esc(fmtAnswer(r, my.value)) : '미제출'}</div></div>`;
  const ans = r.type === 'choice' ? `${'①②③④'[r.answer[0] - 1]} ${esc(r.options[r.answer[0] - 1])}` : esc(r.answer.join(' / '));
  const scene = v.phase === 'SCENE' && v.scene ? sceneHtml(v.scene, t) : '';
  const head = `<div class="qhead"><span class="no">${r.no}번 결과</span><span class="sport">${sportById[r.sport].icon} ${esc(r.sportName)}</span></div>${mine}
    <div class="card"><div class="muted small">정답</div><div style="font-size:1.2rem;font-weight:700">${ans}</div>${r.explanation ? `<div class="small" style="margin-top:6px">${esc(r.explanation)}</div>` : ''}</div>`;
  if (r.secret) {   // 묶음 종목 : 팀 점수·정답률·문항 승리 팀은 경기에서 공개
    const b = r.bundle;
    $('view').innerHTML = `${head}<div class="card secret">🔒 두 팀의 점수와 정답률은 <b>${sportById[r.sport].icon} ${esc(r.sportName)} 경기</b>에서 공개돼요${b ? `<div class="small muted" style="margin-top:4px">${esc(b.gauge)} ${b.done}/${b.of}</div><div class="gauge n"><i style="width:${Math.min(100, b.done / b.of * 100)}%"></i></div>` : ''}</div>${scene}`;
    return;
  }
  $('view').innerHTML = `${head}
    <div class="teams2">${['rabbit', 'cat'].map(k => `<div class="t ${k} ${r.winner === k ? 'win' : ''}">${face(k, 32)}<div>${esc(TN(k))}</div><b>${fmt1(r.teams[k].T)}</b><div class="small muted">정답률 ${r.teams[k].correctRate}%</div></div>`).join('')}</div>
    <div class="winline">${r.winner === 'draw' ? '무승부' : `${esc(TN(r.winner))} 문항 승리!`}</div>${scene}`;
}
function sceneHtml(s, t) {   // 승패·기록은 앞 화면 경기가 끝난 뒤(done)에만
  const title = `<div class="big">${sportById[s.sport].icon} ${esc(s.eventName)} ${s.mode === 'bundle' ? '' : `${s.index}/${s.of}발`}</div>`;

  if (!s.done || !s.result) return `<div class="scene card"><div class="muted">📺 앞 화면에서 경기를 보세요</div>${title}<div class="muted small">${s.done ? '📺 결과는 앞 화면에서 확인하세요' : '경기가 끝나면 결과가 나와요'}</div></div>`;
  const w = s.winner === 'draw' ? '무승부' : `${esc(TN(s.winner))} 승!`;
  const rec = s.mode === 'bundle' ? `${esc(s.result.rabbit.label)} vs ${esc(s.result.cat.label)}` : `${esc(s.result.rabbit.label)}점 vs ${esc(s.result.cat.label)}점`;
  return `<div class="scene card"><div class="muted">📺 앞 화면에서 경기를 보세요</div>${title}<div class="big ${s.winner === 'rabbit' ? 'r' : s.winner === 'cat' ? 'c' : ''}">${w}</div><div class="mono">${rec}</div></div>`;
}
function renderSummary(s) {
  // 학생 요약 : 종료된 종목 이름과 다음 종목만. 팀 점수·메달·리더·승리 팀은 교사 앞 화면에서 공개(17절).
  const e = s.event;
  if (played.summary !== e.sport) { played.summary = e.sport; }
  $('view').innerHTML = `<div class="hero">${face(view.me.team, 72)}<h2>🥇 ${sportById[e.sport].icon} ${esc(e.name)} 종료</h2><p class="muted">📺 결과는 앞 화면에서 확인하세요</p></div>
    ${s.next ? `<div class="card">다음 종목 : ${sportById[s.next.sport].icon} <b>${esc(s.next.name)}</b></div>` : '<div class="card">모든 종목이 끝났어요. 최종 결과를 기다려요.</div>'}`;
}
function renderFinal(f) {
  const t = view.me.team, won = f.winner === t, my = f.my;
  if (!played.final) { played.final = true; if (f.winner === 'draw') audio.fanfare(); else if (won) audio.victory(); else audio.lose(); }
  $('view').innerHTML = `<div class="hero">${face(t, 96)}<h2>${f.winner === 'draw' ? '무승부!' : won ? '🏆 우리 팀 우승!' : '아쉽지만 다음 기회에!'}</h2><p class="mono">${esc(TN('rabbit'))} ${fmt1(f.totals.rabbit)} : ${fmt1(f.totals.cat)} ${esc(TN('cat'))}</p></div>
    ${my ? `<div class="card"><div class="muted small">내 기록</div><dl class="kv"><dt>정답 수</dt><dd>${my.correct} / ${my.played}문항</dd><dt>평균 정답 시간</dt><dd>${my.avgTime == null ? '—' : my.avgTime + '초'}</dd><dt>내가 모은 점수</dt><dd class="mono">${fmt1(my.score)}점</dd></dl></div>` : ''}
    <table class="s"><thead><tr><th>종목</th><th>승리 팀</th></tr></thead><tbody>${f.events.map(e => `<tr><td>${sportById[e.sport].icon} ${esc(e.name)}</td><td>${e.status === 'notPlayed' ? '<span class="muted">미진행</span>' : e.winner === 'draw' ? '무승부' : esc(TN(e.winner))}</td></tr>`).join('')}</tbody></table>`;
}
function renderJoin(err) {
  const room = (saved && saved.room) || Q.get('room') || '';
  $('view').innerHTML = `<div class="hero"><div>${face('rabbit', 64)}${face('cat', 64)}</div><h2>입장하기</h2><p class="muted">방 코드와 학번, 이름을 입력하세요.</p></div>
    <div class="field"><label>방 코드</label><input id="inRoom" inputmode="numeric" maxlength="4" value="${esc(room)}" placeholder="4자리"></div>
    <div class="field"><label>학번</label><input id="inNo" inputmode="numeric" maxlength="6" value="${esc(saved ? saved.studentNo || '' : '')}" placeholder="예 : 10203"></div>
    <div class="field"><label>이름</label><input id="inName" maxlength="10" value="${esc(saved ? saved.name || '' : '')}" placeholder="이름"></div>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}<button class="btn primary big" id="btnJoin">입장</button>`;
  $('btnJoin').onclick = doJoin;
  ['inRoom', 'inNo', 'inName'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); }));
}
function doJoin() {
  const room = $('inRoom').value.trim(), no = $('inNo').value.trim(), name = $('inName').value.trim();
  if (!/^\d{4}$/.test(room)) { renderJoin('방 코드는 숫자 4자리예요.'); return; }
  if (!/^\d{4,6}$/.test(no)) { renderJoin('학번을 확인하세요.'); return; }
  if (name.replace(/\s/g, '').length < 2) { renderJoin('이름을 2자 이상 입력하세요.'); return; }
  const token = saved && saved.room === room && saved.studentNo === no ? saved.token : null;
  saved = { room, studentNo: no, name, token }; save();
  $('btnJoin').disabled = true; $('btnJoin').textContent = '연결 중…';
  if (!net || net.code !== room) connect(room); else if (net.open) sendJoin(no, name, token); else net.connect();
  setTimeout(() => { if (!me) { const b = $('btnJoin'); if (b) { b.disabled = false; b.textContent = '입장'; } if (!net.open) toast('선생님 화면에 연결하지 못했어요. 방 코드를 확인하고 다시 눌러 주세요.'); } }, 9000);
}
$('btnSound').onclick = () => { const on = audio.enable(!audio.enabled); $('btnSound').textContent = on ? '🔊' : '🔇'; if (timer) timer.audio = on ? audio : null; };
document.addEventListener('visibilitychange', () => { if (!document.hidden && net && !net.open && saved && saved.room) net.connect(); });
load();
const qroom = Q.get('room');
if (qroom && saved && saved.room !== qroom) saved = { room: qroom, studentNo: saved.studentNo, name: saved.name };
if (!saved && qroom) saved = { room: qroom };
renderJoin();
if (saved && saved.room && saved.studentNo && saved.token) { connect(saved.room); }
window.OLQS = { get net() { return net; }, get me() { return me; }, get view() { return view; }, submit };

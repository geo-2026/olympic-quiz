/* 관리자(교사) 화면 — 이 브라우저가 호스트(서버 역할). 게임 상태는 core/game.js, 통신은 net.js */
import { Game } from './core/game.js';
import { HostNet, detectTransport } from './net.js';
import { GameAudio } from './audio.js';
import { Timer } from './timer.js';
import { faceImg } from './faces.js';
import { readQuestionFile, rowsToQuestions, downloadTemplate, exportResults } from './excel.js';
import { SAMPLE_SHEETS, SAMPLE_NAME } from './sampleQuestions.js';
import { TYPE_NAME, answerText, toQuestions } from './core/questions.js';
import { SPORTS, sportById, assignEvents, eventOfQuestion } from './core/events.js';
import { TEAMS, GRACE_MS, round1 } from './core/scoring.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt1 = v => (v == null ? '—' : Number(v).toFixed(1));
const transport = detectTransport();
const audio = new GameAudio();
let game = null, net = null, timer = null, closeTimer = null, pending = null, broadcastT = null, persistT = null;
const scene = { sport: null, type: null, ready: false, waiting: null, fallback: null, hard: null };
const TN = t => game ? game.teamName(t) : (t === 'rabbit' ? '토끼팀' : '고양이팀');
const face = (t, size = 40) => faceImg(t, size);
const DIR = { tug: 'tug', skijump: 'skijump', skeleton: 'skeleton', longjump: 'longjump', archery: 'archery', pistol: 'pistol' };

/* ───────── 시작 : 이어서 하기 / 새 방 ───────── */
function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }
function boot() {
  const last = localStorage.getItem('olq:host:last');
  const snap = last ? safeJSON(localStorage.getItem('olq:host:' + last)) : null;
  if (snap && snap.phase !== 'FINAL' && (snap.questions.length || Object.keys(snap.students).length)) {
    modal(`<h3>진행 중인 게임이 있어요</h3><p>방 <b class="mono">${esc(snap.code)}</b> · 문항 ${snap.questions.length}개 · 학생 ${Object.values(snap.students).filter(s => !s.kicked).length}명 · 단계 ${esc(snap.phase)}</p><p class="small muted">이어서 하면 학생들은 같은 방 코드로 다시 접속하면 됩니다.</p>`,
      [['새 방 만들기', 'ghost', () => newRoom()], ['이어서 진행', 'primary', () => resume(snap)]]);
  } else newRoom();
}
function newRoom() {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  game = new Game({ code });
  startHost();
}
function resume(snap) {
  game = Game.restore(snap);
  // 복구 뒤 : 풀이 중이던 문항은 시간이 지났으면 마감
  if (game.phase === 'QUESTION_OPEN') { if (Date.now() > game.state.q.endsAt + GRACE_MS) game.closeQuestion('time'); }
  Object.values(game.state.students).forEach(st => { st.connected = false; st.clientId = null; });
  startHost();
}
async function startHost() {
  if (net) net.stop();
  $('roomCode').textContent = game.code; localStorage.setItem('olq:host:last', game.code);
  net = new HostNet({ code: game.code, transport });
  net.on('status', s => setNet(s)).on('connect', () => { }).on('disconnect', id => { if (game.disconnect(id)) refresh(); })
    .on('message', onMessage).on('error', err => { if (err.type === 'unavailable-id') { toast('이 방 코드는 다른 곳에서 쓰고 있어요. 새 코드로 다시 만듭니다.'); setTimeout(newRoom, 800); } else if (err.type === 'network' || err.type === 'server-error') setNet('bad'); });
  setNet('connecting');
  try { await net.start(); } catch (e) { setNet('bad'); }
  applySettingsToUI(); refresh(); renderQuestionsTab(); renderQR();
}
function setNet(s) {
  const el = $('net');
  el.className = s === 'open' ? 'open' : s === 'bad' ? 'bad' : '';
  el.textContent = s === 'open' ? (transport === 'local' ? '같은 기기 모드' : '온라인 · 학생 접속 가능') : s === 'bad' ? '연결 실패 — 인터넷을 확인하세요' : s === 'reconnecting' ? '다시 연결 중…' : '연결 중…';
}
function joinUrl() { const u = new URL('play.html', location.href); u.searchParams.set('room', game.code); if (transport === 'local') u.searchParams.set('net', 'local'); return u.href; }
function renderQR() {
  const url = joinUrl(); $('joinUrl').textContent = url;
  $('qr').innerHTML = ''; try { new QRCode($('qr'), { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { }
  $('transportInfo').textContent = transport === 'local' ? '같은 기기 시연 모드 : 이 브라우저의 다른 탭에서만 학생 화면이 연결됩니다.' : '온라인 모드 : PeerJS(WebRTC)로 학생 기기와 직접 연결합니다. 같은 와이파이가 아니어도 되지만 학교 네트워크가 WebRTC를 막으면 연결되지 않을 수 있어요.';
}

/* ───────── 학생 메시지 ───────── */
function onMessage(clientId, m) {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'join') {
    if (String(m.roomCode) !== game.code) { net.send(clientId, { type: 'joinError', error: '방 코드가 달라요.' }); return; }
    const r = game.join({ studentNo: m.studentNo, name: m.name, token: m.token, clientId });
    if (r.error) { net.send(clientId, { type: 'joinError', error: r.error }); return; }
    const st = r.student;
    net.send(clientId, { type: 'joined', me: { id: st.id, studentNo: st.studentNo, name: st.name, team: st.team, token: st.token }, view: game.studentView(st.id) });
    if (!r.reconnected) { audio.pop(); toast(`${st.name} 입장 → ${TN(st.team)}`); }
    refresh();
  } else if (m.type === 'answer') {
    const st = game.studentByClient(clientId); if (!st) { net.send(clientId, { type: 'ack', questionId: m.questionId, accepted: false, reason: 'unknown' }); return; }
    const r = game.submitAnswer(st.id, m.questionId, m.answer);
    net.send(clientId, { type: 'ack', questionId: m.questionId, accepted: r.accepted, reason: r.reason });
    if (r.accepted && game.phase === 'QUESTION_CLOSED') onClosed();
    refresh();
  } else if (m.type === 'ping') net.send(clientId, { type: 'pong', t: m.t, now: Date.now() });
  else if (m.type === 'leave') { if (game.disconnect(clientId)) refresh(); }
}
function broadcast() {
  clearTimeout(broadcastT);
  broadcastT = setTimeout(() => { for (const st of Object.values(game.state.students)) if (st.clientId && st.connected && !st.kicked) net.send(st.clientId, { type: 'state', view: game.studentView(st.id) }); }, 40);
}
function persist() { clearTimeout(persistT); persistT = setTimeout(() => { try { localStorage.setItem('olq:host:' + game.code, JSON.stringify(game.snapshot())); } catch (e) { } }, 800); }
function refresh() { persist(); render(); broadcast(); }

/* ───────── 진행 동작 ───────── */
function startGame() { try { game.startGame(); preloadScene(); refresh(); } catch (e) { toast(e.message); } }
function openQuestion() {
  try { game.startQuestion(); } catch (e) { toast(e.message); return; }
  const rt = game.state.q;
  clearTimeout(closeTimer); closeTimer = setTimeout(() => { if (game.phase === 'QUESTION_OPEN') { game.closeQuestion('time'); onClosed(); refresh(); } }, rt.endsAt + GRACE_MS - Date.now());
  refresh();
}
function closeNow() { if (game.phase !== 'QUESTION_OPEN') return; clearTimeout(closeTimer); game.closeQuestion('manual'); onClosed(); refresh(); }
function onClosed() { clearTimeout(closeTimer); if (timer) timer.stop(); audio.buzzer(); }
function reveal() { try { game.reveal(); } catch (e) { toast(e.message); return; } const r = game.revealPayload(); if (r.winner !== 'draw') audio.fanfare(); refresh(); }
function playScene() {
  let sc; try { sc = game.playScene(); } catch (e) { toast(e.message); return; }
  refresh(); ensureScene(sc.sport); sendPlay(sc);
}
function next() { try { game.next(); } catch (e) { toast(e.message); return; } if (game.phase === 'EVENT_SUMMARY') { sendSummary(); audio.fanfare(); } preloadScene(); refresh(); }
function nextEvent() { try { game.nextEvent(); } catch (e) { toast(e.message); return; } if (game.phase === 'FINAL') onFinal(); preloadScene(); refresh(); }
function endGame() {
  const info = game.endGameInfo();
  modal(`<h3>게임을 종료할까요?</h3><p>남은 문항 ${info.remaining}개가 있어요. 지금 종료하면 최종 결과로 넘어갑니다.</p>${info.inProgress ? `<p class="warnbox">진행 중인 ${info.inProgress}번 문항은 점수에 넣지 않아요.</p>` : ''}`,
    [['취소', 'ghost', () => { }], ['종료', 'danger', () => { clearTimeout(closeTimer); if (timer) timer.stop(); game.endGame(); onFinal(); refresh(); }]]);
}
function onFinal() { audio.fanfare(); setTimeout(() => audio.fanfare(), 700); confetti(); }

/* ───────── 경기 장면(iframe) ───────── */
function sceneFrame() { let f = $('sceneFrame'); if (!f) { f = document.createElement('iframe'); f.id = 'sceneFrame'; f.title = '경기 장면'; f.allow = 'autoplay'; f.style.display = 'none'; $('stagewrap').appendChild(f); } return f; }
function ensureScene(sport) {
  if (scene.sport === sport && sceneFrame().src) return;
  scene.sport = sport; scene.type = sportById[sport].scene; scene.ready = false;
  const names = encodeURIComponent(`${TN('rabbit')},${TN('cat')}`);
  sceneFrame().src = `scenes/${DIR[sport]}/index.html?mode=app&names=${names}`;
}
function preloadScene() { // 종목의 첫 문항을 준비할 때 장면을 미리 불러 둠
  if (game.phase !== 'READY' || !game.question) return;
  const info = eventOfQuestion(game.state.events, game.question.no); if (info) ensureScene(info.ev.sport);
}
function sendPlay(sc) {
  const f = sceneFrame();
  const msg = { type: scene.type, action: 'playResult', mode: sc.mode, index: sc.index, of: sc.of, questions: sc.questions, scores: sc.scores, winner: sc.winner, result: sc.result, finish: sc.finish };
  const go = () => { try { f.contentWindow.postMessage(msg, '*'); } catch (e) { } };
  scene.waiting = go; if (scene.ready) go();
  clearTimeout(scene.fallback); clearTimeout(scene.hard);
  scene.fallback = setTimeout(() => { if (game.phase === 'SCENE' && !game.state.scene.done && !scene.accepted) skipScene('장면이 응답하지 않아 건너뛰었어요.'); }, 10000);
  scene.hard = setTimeout(() => { if (game.phase === 'SCENE' && !game.state.scene.done) skipScene('장면이 끝나지 않아 건너뛰었어요.'); }, 75000);
  scene.accepted = false;
}
function skipScene(msg) { game.sceneDone(); toast(msg); refresh(); }
function sendSummary() {
  const s = game.state.summary; if (!s || !scene.type) return;
  const e = s.event, w = e.winner === 'draw' ? '무승부' : TN(e.winner) + ' 승리';
  const text = e.mode === 'bundle' ? `${e.played}문항 합산 ${fmt1(e.Tsum.rabbit)} : ${fmt1(e.Tsum.cat)} · ${w}` : `${TN('rabbit')} ${e.wins.rabbit}승 ${e.wins.cat}패 · ${w}`;
  try { sceneFrame().contentWindow.postMessage({ type: scene.type, action: 'eventSummary', title: `${e.name} 종료`, text }, '*'); } catch (err) { }
}
window.addEventListener('message', e => {
  const m = e.data; if (!m || typeof m.type !== 'string' || !m.type.endsWith(':event')) return;
  if (m.type !== scene.type + ':event') return;
  if (m.event === 'ready') { scene.ready = true; if (scene.waiting) { const g = scene.waiting; scene.waiting = null; setTimeout(g, 300); } }
  else if (m.event === 'playAccepted') scene.accepted = !!(m.data && m.data.accepted);
  else if (m.event === 'done') { clearTimeout(scene.fallback); clearTimeout(scene.hard); if (game.phase === 'SCENE') { game.sceneDone(); audio.fanfare(); refresh(); } }
});

/* ───────── 화면 ───────── */
function render() {
  const v = game.adminView();
  renderProgress(v); renderControls(v); renderStage(v); renderStudents(v); $('qConfirmed').textContent = v.total ? `확정된 문항 ${v.total}개${v.started ? ' (게임 시작 뒤에는 바꿀 수 없음)' : ''}` : '아직 확정된 문항이 없어요.';
  $('btnConfirmQ').disabled = !pending || pending.errors > 0 || v.started; $('btnShuffle').disabled = v.started; $('btnResetRoom').disabled = false;
}
function renderProgress(v) {
  const cur = v.question ? v.question.no : (v.current >= 0 && v.questions[v.current] ? v.questions[v.current].no : null);
  const evs = v.events.map(ev => {
    const done = v.eventResults.find(e => e.sport === ev.sport && e.status !== 'notPlayed');
    const isCur = cur != null && cur >= ev.from && cur <= ev.to && v.phase !== 'FINAL';
    const medal = done ? `<span class="medal ${done.winner === 'draw' ? 'draw' : done.winner}"></span>` : '';
    return `<span class="ev ${isCur ? 'cur' : ''} ${done ? 'done' : ''}">${sportById[ev.sport].icon} ${esc(ev.name)} <span class="muted small">${ev.from}${ev.to > ev.from ? '~' + ev.to : ''}</span>${medal}</span>`;
  }).join('');
  $('progress').innerHTML = `<span class="qno">${v.phase === 'LOBBY' ? '대기실' : v.phase === 'FINAL' ? '최종 결과' : cur ? `${cur} / ${v.total}` : ''}</span>${evs}`;
}
function renderControls(v) {
  const p = v.phase, sc = v.scene;
  const on = (id, ok) => { $(id).disabled = !ok; };
  on('cStart', p === 'LOBBY' && v.total > 0 && v.students.length > 0);
  on('cOpen', p === 'READY'); on('cClose', p === 'QUESTION_OPEN'); on('cReveal', p === 'QUESTION_CLOSED');
  on('cScene', p === 'REVEAL' && v.canPlayScene);
  on('cNext', (p === 'REVEAL' && !v.canPlayScene) || (p === 'SCENE' && sc && sc.done));
  on('cNextEvent', p === 'EVENT_SUMMARY'); on('cExport', p === 'FINAL'); on('cEnd', p !== 'LOBBY' && p !== 'FINAL');
  $('cNextEvent').textContent = p === 'EVENT_SUMMARY' && v.summary && v.summary.isFinal ? '최종 결과 보기' : '다음 종목 시작';
  $('cStart').hidden = p !== 'LOBBY'; $('cNextEvent').hidden = p !== 'EVENT_SUMMARY'; $('cExport').hidden = p !== 'FINAL';
}
function teamBox(t, inner, cls = '') { return `<div class="t ${t} ${cls}">${inner}</div>`; }
function renderStage(v) {
  const st = $('stage'), p = v.phase;
  const f = sceneFrame();
  if (p !== 'SCENE') { st.classList.remove('scene'); f.style.display = 'none'; st.style.display = ''; }
  if (p === 'LOBBY') {
    if (timer) { timer.stop(); timer = null; }
    st.innerHTML = `<div class="lobby"><div><div id="bigqr"></div><p class="muted">QR을 찍거나 주소로 접속</p><div class="url">${esc(joinUrl())}</div></div>
      <div><p class="muted" style="font-size:1.4rem;margin:0">방 코드</p><div class="big">${esc(v.code)}</div>
      <div class="counts">${teamBox('rabbit', `${face('rabbit', 56)}<div>${esc(TN('rabbit'))}</div><b>${v.counts.rabbit}</b>명`)}${teamBox('cat', `${face('cat', 56)}<div>${esc(TN('cat'))}</div><b>${v.counts.cat}</b>명`)}</div>
      <p class="muted" style="font-size:1.2rem">${v.total ? `문항 ${v.total}개 준비 완료 · ${v.events.map(e => sportById[e.sport].icon + e.name).join(' → ')}` : '왼쪽 [문항] 탭에서 문항을 업로드하고 확정하세요.'}</p></div></div>`;
    try { new QRCode($('bigqr'), { text: joinUrl(), width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { }
    return;
  }
  if (p === 'READY') {
    if (timer) { timer.stop(); timer = null; }
    const q = v.question, ev = q.ev;
    st.innerHTML = `<div class="ready"><div class="no">${q.no}번</div><div class="sport">${sportById[ev.sport].icon} ${esc(ev.name)} · ${ev.mode === 'bundle' ? `문항 ${q.indexInEvent}/${q.ofInEvent}` : `${q.indexInEvent}/${q.ofInEvent}발`}</div>
      <div class="type">${TYPE_NAME[q.type]} · 제한 시간 ${q.limit}초</div>${bundleGauge(game.bundleProgress(q.no))}<p class="muted">[문제 시작]을 누르면 모든 학생에게 동시에 보냅니다.</p></div>`;
    return;
  }
  if (p === 'QUESTION_OPEN' || p === 'QUESTION_CLOSED') {
    const q = v.question, open = p === 'QUESTION_OPEN';
    const label = q.mode === 'bundle' ? `${esc(q.sportName)} 문항 ${q.indexInEvent}/${q.ofInEvent}` : `${esc(q.sportName)} ${q.indexInEvent}/${q.ofInEvent}발`;
    const allSub = !open && v.closedReason === 'all' && Date.now() - v.closedAt < 3000;
    st.innerHTML = `<div class="stg-title"><h2>${q.no}번</h2><span class="sub">${label} · ${TYPE_NAME[q.type]}</span></div>
      <div class="timerwrap"><div class="tnum" id="tnum">${q.limit}</div><div class="tbar"><i id="tbar"></i></div></div>
      ${questionBody(q)}
      ${allSub ? '<div class="allsub">모두 제출!</div>' : !open ? '<div class="timeover">마감 · 채점 완료</div>' : ''}
      <div class="subm">${TEAMS.map(t => teamBox(t, `${face(t, 44)}<span>${esc(TN(t))}</span><b>${v.progress[t].submitted}</b>/ ${v.progress[t].total} 제출`)).join('')}</div>`;
    if (open) {
      if (!timer || timer.startedAt !== q.startedAt) {
        timer = new Timer({ num: $('tnum'), bar: $('tbar'), root: document.body, count: $('countdown') }, audio.enabled ? audio : null, { onEnd: () => { } });
        timer.sync(q.serverNow); timer.start(q.startedAt, q.endsAt);
      } else { timer.el.num = $('tnum'); timer.el.bar = $('tbar'); }
    } else { if (timer) { timer.stop(); timer = null; } document.body.classList.remove('t-green', 't-yellow', 't-orange', 't-red', 't-last3', 't-over'); $('countdown').textContent = ''; }
    if (allSub) setTimeout(() => { if (game.phase === 'QUESTION_CLOSED') render(); }, 3100);
    return;
  }
  if (timer) { timer.stop(); timer = null; } document.body.classList.remove('t-green', 't-yellow', 't-orange', 't-red', 't-last3', 't-over');
  if (p === 'REVEAL' || (p === 'SCENE' && false)) { st.innerHTML = revealHtml(v.reveal); return; }
  if (p === 'SCENE') {
    st.classList.add('scene'); st.innerHTML = ''; st.style.display = 'none'; f.style.display = 'block';
    const sc = v.scene;
    let bar = $('scenebar'); if (!bar) { bar = document.createElement('div'); bar.id = 'scenebar'; bar.className = 'scenebar'; $('stagewrap').appendChild(bar); }
    bar.style.display = 'flex';
    bar.innerHTML = `<span>${sportById[sc.sport].icon} ${esc(sc.eventName)} ${sc.mode === 'bundle' ? `· ${sc.questions.length}문항 합산` : `· ${sc.index}/${sc.of}발 (${sc.questions[0]}번)`}</span><span class="r">${esc(TN('rabbit'))} ${fmt1(sc.scores.rabbit)}</span><span>:</span><span class="c">${fmt1(sc.scores.cat)} ${esc(TN('cat'))}</span><span class="spacer" style="flex:1"></span><span>${sc.done ? '경기 끝 · [다음 문제]를 누르세요' : '경기 중…'}</span>${sc.done ? '' : '<button class="btn sm ghost" id="btnSkipScene">건너뛰기</button>'}`;
    const b = $('btnSkipScene'); if (b) b.onclick = () => skipScene('장면을 건너뛰었어요.');
    return;
  }
  const bar = $('scenebar'); if (bar) bar.style.display = 'none';
  if (p === 'EVENT_SUMMARY') { st.innerHTML = summaryHtml(v.summary); return; }
  if (p === 'FINAL') { st.innerHTML = finalHtml(v.final, v); return; }
}
function questionBody(q) {
  let body = `<div class="qtext">${esc(q.text)}</div>`;
  if (q.image) body += `<img class="qimg" src="${esc(q.image)}" alt="">`;
  if (q.type === 'ox') body += `<div class="ox"><div class="opt" data-v="O">O</div><div class="opt" data-v="X">X</div></div>`;
  else if (q.type === 'choice') body += `<div class="opts">${q.options.map((o, i) => `<div class="opt" data-v="${i + 1}"><span class="n">${'①②③④'[i]}</span><span>${esc(o)}</span></div>`).join('')}</div>`;
  else if (q.hint) body += `<div><span class="hint">정답 글자 수: ${esc(q.hint.label)}</span></div>`;
  return body;
}
function bundleGauge(b) {
  if (!b) return '';
  return `<div class="bundle"><div class="lab"><span>${sportById[b.sport].icon} ${esc(b.name)} ${esc(b.gauge)} ${b.done}/${b.of}</span><span><span class="r">${esc(TN('rabbit'))} ${fmt1(b.S.rabbit)}</span> : <span class="c">${fmt1(b.S.cat)} ${esc(TN('cat'))}</span></span></div>
    <div class="two"><div class="gauge r"><i style="width:${Math.min(100, b.S.rabbit / b.max * 100)}%"></i></div><div class="gauge c"><i style="width:${Math.min(100, b.S.cat / b.max * 100)}%"></i></div></div></div>`;
}
function revealHtml(r) {
  const q = r; const label = q.mode === 'bundle' ? `${esc(q.sportName)} 문항 ${q.indexInEvent}/${q.ofInEvent}` : `${esc(q.sportName)} ${q.indexInEvent}/${q.ofInEvent}발`;
  const opts = q.type === 'ox' ? `<div class="ox"><div class="opt ${q.answer[0] === 'O' ? 'ans' : ''}">O</div><div class="opt ${q.answer[0] === 'X' ? 'ans' : ''}">X</div></div>`
    : q.type === 'choice' ? `<div class="opts">${q.options.map((o, i) => `<div class="opt ${q.answer[0] === i + 1 ? 'ans' : ''}"><span class="n">${'①②③④'[i]}</span><span>${esc(o)}</span></div>`).join('')}</div>`
      : `<div class="answerbox">정답 : ${esc(q.answer.join(' / '))}</div>`;
  const win = q.winner === 'draw' ? '<div class="winline">무승부</div>' : `<div class="winline ${q.winner === 'rabbit' ? 'r' : 'c'}">${face(q.winner, 48)} ${esc(TN(q.winner))} 문항 승리!</div>`;
  return `<div class="stg-title"><h2>${q.no}번 정답</h2><span class="sub">${label}</span></div><div class="qtext" style="font-size:clamp(26px,2.4vw,40px)">${esc(q.text)}</div>${opts}
    ${q.explanation ? `<div class="expl">${esc(q.explanation)}</div>` : ''}
    <div class="stats">${TEAMS.map(t => { const s = q.teams[t]; return teamBox(t, `<h3>${face(t, 44)} ${esc(TN(t))}</h3><div class="T">${fmt1(s.T)}<span style="font-size:1.2rem;color:var(--muted)"> 점</span></div><div class="meta">정답률 ${s.correct}/${s.total} (${s.correctRate}%) · 평균 정답 시간 ${s.avgTime == null ? '—' : s.avgTime + '초'}</div>`, q.winner === t ? 'win' : ''); }).join('')}</div>
    ${win}${bundleGauge(q.bundle)}`;
}
function totalsBars(totals, diff, leader) {
  const max = Math.max(totals.rabbit, totals.cat, 1);
  return `<div class="scorebars">${TEAMS.map(t => `<div><div class="lab"><span class="${t === 'rabbit' ? 'r' : 'c'}">${face(t, 32)} ${esc(TN(t))}</span><span>${fmt1(totals[t])}</span></div><div class="gauge ${t === 'rabbit' ? 'r' : 'c'}" style="height:30px"><i style="width:${totals[t] / max * 100}%"></i></div></div>`).join('')}
    <div class="diffline">${leader === 'draw' ? '동점이에요!' : `▶ ${esc(TN(leader))}이 ${fmt1(diff)}점 앞서 있어요`}</div></div>`;
}
function medalsHtml(medals) {
  return `<div class="stats">${TEAMS.map(t => teamBox(t, `<h3>${face(t, 36)} ${esc(TN(t))} 메달 ${medals[t].length}</h3><div style="font-size:1.8rem">${medals[t].map(s => sportById[s].icon).join(' ') || '—'}</div>`)).join('')}</div>`;
}
function summaryHtml(s) {
  const e = s.event, w = e.winner === 'draw' ? '무승부' : `${esc(TN(e.winner))} 승리`;
  const detail = e.mode === 'bundle' ? `${e.played}문항 합산 ${fmt1(e.Tsum.rabbit)} : ${fmt1(e.Tsum.cat)}` : `${e.wins.rabbit}승 ${e.wins.cat}패${e.decidedBy === '문항 점수 합' ? ' · 문항 점수 합으로 결정' : ''}`;
  const rec = e.record ? ` · 기록 ${esc(e.record.rabbit.label)} : ${esc(e.record.cat.label)}` : e.recordTotals ? ` · 기록 합계 ${e.recordTotals.rabbit} : ${e.recordTotals.cat}` : '';
  const ts = e.Ts && e.Ts.length ? `<table class="stg"><thead><tr><th>문항</th>${e.Ts.map(x => `<th>${x.no}번</th>`).join('')}<th>합</th></tr></thead><tbody>${TEAMS.map(t => `<tr><td class="${t === 'rabbit' ? 'r' : 'c'}">${esc(TN(t))}</td>${e.Ts.map(x => `<td class="${x.winner === t ? 'win' : ''}">${fmt1(x[t])}</td>`).join('')}<td>${fmt1(e.Tsum[t])}</td></tr>`).join('')}</tbody></table>` : '';
  const next = s.next ? `<div class="card" style="font-size:1.4rem">다음 종목: ${sportById[s.next.sport].icon} <b>${esc(s.next.name)}</b> (${s.next.from}~${s.next.to}번 문항 · ${esc(s.next.play)})</div>` : `<div class="card" style="font-size:1.4rem">모든 종목이 끝났어요. [최종 결과 보기]를 누르세요.</div>`;
  const winFace = e.winner !== 'draw' ? `<div class="podium"><div class="p win"><div class="faces">${face(e.winner, 96)}</div><div class="blk bg-${e.winner === 'rabbit' ? 'r' : 'c'}" style="height:60px">🥇</div></div></div>` : '';
  return `<div class="stg-title"><h2>🥇 ${sportById[e.sport].icon} ${esc(e.name)} — ${w}</h2><span class="sub">${detail}${rec}</span></div>
    <div class="summary"><div>${winFace}${ts}</div><div>${totalsBars(s.totals, s.diff, s.leader)}${medalsHtml(s.medals)}</div></div>${next}`;
}
function finalHtml(f, v) {
  const w = f.winner;
  const head = w === 'draw' ? '<h2 style="font-size:3.6rem;text-align:center">무승부!</h2>' : `<h2 style="font-size:3.6rem;text-align:center" class="${w === 'rabbit' ? 'r' : 'c'}">🏆 ${esc(TN(w))} 우승!</h2>`;
  const podium = `<div class="podium">${['rabbit', 'cat'].sort((a, b) => f.totals[b] - f.totals[a]).map((t, i) => `<div class="p ${w === t ? 'win' : ''}"><div class="faces">${face(t, 80)}${face(t, 80)}${face(t, 80)}</div><div class="blk bg-${t === 'rabbit' ? 'r' : 'c'}" style="height:${i === 0 ? 110 : 70}px">${i === 0 && w !== 'draw' ? '1' : w === 'draw' ? '1' : '2'}</div><div class="mono" style="font-size:1.6rem">${fmt1(f.totals[t])}점</div></div>`).join('')}</div>`;
  const W = t => (t === 'draw' ? '무승부' : esc(TN(t)));
  const rows = f.events.map(e => `<tr><td>${sportById[e.sport].icon} ${esc(e.name)}</td><td>${e.from}~${e.to}</td><td>${e.mode === 'bundle' ? '묶음' : '문항별'}</td>
    <td class="${e.winner === 'rabbit' && e.status !== 'notPlayed' ? 'win' : ''}">${e.mode === 'bundle' ? fmt1(e.Tsum.rabbit) : e.wins.rabbit + '승'}${e.record ? ` (${esc(e.record.rabbit.label)})` : ''}</td>
    <td class="${e.winner === 'cat' && e.status !== 'notPlayed' ? 'win' : ''}">${e.mode === 'bundle' ? fmt1(e.Tsum.cat) : e.wins.cat + '승'}${e.record ? ` (${esc(e.record.cat.label)})` : ''}</td>
    <td>${e.status === 'notPlayed' ? '<span class="muted">미진행</span>' : W(e.winner) + (e.status === 'partial' ? ` <span class="muted small">(부분 진행 ${e.played}/${e.count}문항)</span>` : '')}</td></tr>`).join('');
  const top = v.settings.showTopContributors ? `<div class="stats">${TEAMS.map(t => teamBox(t, `<h3>${esc(TN(t))} 점수 기여 TOP 3</h3><ol style="margin:4px 0 0 20px;font-size:1.2rem">${f.top[t].map(s => `<li>${esc(s.name)} (${esc(s.studentNo)}) · ${fmt1(s.score)}점 · 정답 ${s.correct}</li>`).join('') || '<li class="muted">—</li>'}</ol>`)).join('')}</div>` : '';
  return `${head}${podium}${totalsBars(f.totals, f.diff, w)}
    <table class="stg"><thead><tr><th>종목</th><th>문항</th><th>방식</th><th class="r">${esc(TN('rabbit'))}</th><th class="c">${esc(TN('cat'))}</th><th>승리 팀</th></tr></thead><tbody>${rows}
    <tr><td colspan="3"><b>최종 합계</b> (문항 T 합 + 보너스 ${f.bonus}점 × 메달)</td><td class="${w === 'rabbit' ? 'win' : ''}">${fmt1(f.totals.rabbit)}</td><td class="${w === 'cat' ? 'win' : ''}">${fmt1(f.totals.cat)}</td><td>${W(w)}</td></tr>
    <tr><td colspan="3">전체 정답률 · 평균 정답 시간</td><td>${f.correctRate.rabbit}% · ${f.avgTime.rabbit ?? '—'}초</td><td>${f.correctRate.cat}% · ${f.avgTime.cat ?? '—'}초</td><td>진행 ${f.played}/${f.total}문항</td></tr></tbody></table>${top}`;
}
function renderStudents(v) {
  const c = v.counts, diff = Math.abs(c.rabbit - c.cat);
  $('teamCounts').textContent = `${TN('rabbit')} ${c.rabbit}명 · ${TN('cat')} ${c.cat}명 (차이 ${diff}명)`;
  $('teamWarn').innerHTML = diff >= 2 ? '<div class="warnbox">두 팀 인원 차이가 2명 이상이에요. ⇄ 버튼으로 옮겨 주세요.</div>' : '';
  $('teamLists').innerHTML = TEAMS.map(t => `<div class="team ${t}"><h4>${face(t, 24)} ${esc(TN(t))} <span class="muted">${c[t]}명</span></h4><ul>${v.students.filter(s => s.team === t).sort((a, b) => a.studentNo.localeCompare(b.studentNo)).map(s => `<li><span class="dot ${s.connected ? 'on' : ''}"></span><span>${esc(s.studentNo)} ${esc(s.name)}</span>${s.duplicate ? '<span class="dup">중복 접속</span>' : ''}${s.joinedAtQuestion > v.current && v.started ? '<span class="dup">다음 문항부터</span>' : ''}<button data-move="${s.id}" title="다른 팀으로">⇄</button><button data-kick="${s.id}" title="내보내기">✕</button></li>`).join('') || '<li class="muted">아직 없음</li>'}</ul></div>`).join('');
}
function renderQuestionsTab() {
  const v = game.adminView();
  const src = pending ? pending.parsed : v.questions.map(q => ({ ...q, answerRaw: answerText(q), errors: [] }));
  $('qTable').innerHTML = src.length ? `<thead><tr><th>#</th><th>유형</th><th>문제</th><th>정답</th><th>초</th></tr></thead><tbody>${src.map((q, i) => `<tr class="${q.errors && q.errors.length ? 'err' : ''}"><td>${i + 1}</td><td>${TYPE_NAME[q.type] || '?'}</td><td>${esc((q.text || '').slice(0, 60))}${q.errors && q.errors.length ? `<div class="e">${esc(q.errors.join(', '))}</div>` : ''}</td><td>${esc(q.answerRaw ?? (q.answers || []).join('|'))}</td><td>${q.limit ?? ''}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="muted">엑셀을 올리거나 예시 문항을 불러오세요.</td></tr></tbody>';
  const n = pending ? applyOrder(pending.parsed.filter(q => !q.errors.length)).length : v.total;
  const evs = assignEvents(n);
  $('evTable').innerHTML = `<thead><tr><th>종목</th><th>방식</th><th>문항</th><th>수</th></tr></thead><tbody>${evs.map(e => `<tr><td>${sportById[e.sport].icon} ${e.name}</td><td>${e.mode === 'bundle' ? '묶음(합산 1회)' : '문항별'}</td><td>${e.from}~${e.to}</td><td>${e.count}${e.partialBundle ? ` <span class="e">(${e.count}문항 합산)</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">문항이 없어요</td></tr>'}</tbody>`;
  $('qInfo').innerHTML = pending ? (pending.errors ? `<span class="e" style="color:var(--no)">오류 ${pending.errors}개 — 고친 뒤 다시 올려 주세요.</span>` : `${pending.parsed.length}문항 읽음${pending.name ? ' · ' + esc(pending.name) : ''} → 사용 ${n}문항`) : '';
}
function applyOrder(list) {
  const mix = $('qMix').value, lim = Number($('qLimit').value) || 0;
  let out = list.slice();
  if (mix === 'shuffle') { for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } }
  else if (mix === 'interleave') { const by = { ox: [], choice: [], short: [] }; out.forEach(q => (by[q.type] || by.short).push(q)); out = []; let any = true; while (any) { any = false; for (const k of ['ox', 'choice', 'short']) if (by[k].length) { out.push(by[k].shift()); any = true; } } }
  if (lim > 0) out = out.slice(0, lim);
  return out;
}
function confirmQuestions() {
  if (!pending || pending.errors) return;
  const ordered = applyOrder(pending.parsed.filter(q => !q.errors.length));
  try { game.setQuestions(toQuestions(ordered)); } catch (e) { toast(e.message); return; }
  pending = null; toast(`문항 ${game.state.questions.length}개를 확정했어요.`); renderQuestionsTab(); refresh();
}

/* ───────── 보조 ───────── */
function modal(html, buttons) {
  const box = $('modalBox'); box.innerHTML = html + `<div class="row">${buttons.map((b, i) => `<button class="btn ${b[1]}" data-i="${i}">${esc(b[0])}</button>`).join('')}</div>`;
  box.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { $('modal').hidden = true; buttons[+b.dataset.i][2](); });
  $('modal').hidden = false;
}
let toastT = null;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function confetti() { const wrap = $('stagewrap'); const cols = ['#ff8fb6', '#ffa64d', '#ffd23d', '#6ad2ff', '#4fd18b']; for (let i = 0; i < 120; i++) { const d = document.createElement('i'); d.className = 'confetti'; d.style.left = Math.random() * 100 + '%'; d.style.background = cols[i % 5]; d.style.animationDuration = 2.5 + Math.random() * 2.5 + 's'; d.style.animationDelay = Math.random() * 1.5 + 's'; wrap.appendChild(d); setTimeout(() => d.remove(), 6000); } }
function applySettingsToUI() { const s = game.state.settings; $('setNoLen').value = s.studentNoLength; $('setBonus').value = s.eventBonus; $('setTop').checked = !!s.showTopContributors; $('setNameR').value = s.teamNames.rabbit === '토끼팀' ? '' : s.teamNames.rabbit; $('setNameC').value = s.teamNames.cat === '고양이팀' ? '' : s.teamNames.cat; }

/* ───────── 이벤트 연결 ───────── */
document.querySelectorAll('#panel .tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('#panel .tabs button').forEach(x => x.classList.toggle('active', x === b)); document.querySelectorAll('#panel section').forEach(s => s.classList.toggle('active', s.id === 'tab-' + b.dataset.tab)); });
$('btnSound').onclick = () => { const on = audio.enable(!audio.enabled); $('btnSound').textContent = on ? '🔊 소리 끄기' : '🔇 소리 켜기'; if (on) audio.pop(); if (timer) timer.audio = on ? audio : null; };
$('setVol').oninput = e => audio.setVolume(+e.target.value);
$('btnFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => { }); };
$('btnPanel').onclick = () => { document.body.classList.toggle('nopanel'); $('btnPanel').textContent = document.body.classList.contains('nopanel') ? '조작판 보이기' : '조작판 숨기기'; };
$('btnCopyUrl').onclick = () => navigator.clipboard.writeText(joinUrl()).then(() => toast('주소를 복사했어요.'), () => toast('복사하지 못했어요.'));
$('btnOpenPlay').onclick = () => window.open(joinUrl(), '_blank');
$('btnNewRoom').onclick = () => modal('<h3>새 방을 만들까요?</h3><p>지금 방의 학생·진행 상태는 이 브라우저에 남지만 더 이상 이어지지 않아요.</p>', [['취소', 'ghost', () => { }], ['새 방', 'primary', () => { newRoom(); }]]);
$('btnResetRoom').onclick = () => modal('<h3>방을 초기화할까요?</h3><p>학생 정보와 진행 상태를 지웁니다(문항·설정은 유지).</p>', [['취소', 'ghost', () => { }], ['초기화', 'danger', () => { net.broadcast({ type: 'kicked' }); game.resetRoom(); refresh(); }]]);
$('fileQ').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { pending = await readQuestionFile(f); pending.name = f.name; } catch (err) { toast('파일을 읽지 못했어요: ' + err.message); pending = null; } renderQuestionsTab(); render(); };
$('btnTemplate').onclick = () => downloadTemplate();
$('btnSample').onclick = () => { pending = rowsToQuestions(SAMPLE_SHEETS); pending.name = SAMPLE_NAME; renderQuestionsTab(); render(); toast('예시 문항을 불러왔어요. 문항 수·순서를 정하고 [확정]을 누르세요.'); };
$('qLimit').oninput = $('qMix').onchange = () => renderQuestionsTab();
$('btnConfirmQ').onclick = confirmQuestions;
$('btnShuffle').onclick = () => { try { game.shuffleTeams(); refresh(); toast('팀을 다시 섞었어요.'); } catch (e) { toast(e.message); } };
$('teamLists').onclick = e => { const m = e.target.closest('[data-move]'), k = e.target.closest('[data-kick]'); if (m) { game.moveStudent(m.dataset.move); refresh(); } if (k) { const st = game.state.students[k.dataset.kick]; if (st && st.clientId) { net.send(st.clientId, { type: 'kicked' }); net.kick(st.clientId); } game.kick(k.dataset.kick); refresh(); } };
$('btnSaveSettings').onclick = () => { game.setSettings({ studentNoLength: +$('setNoLen').value, eventBonus: Math.max(0, Math.min(100, +$('setBonus').value || 0)), showTopContributors: $('setTop').checked, teamNames: { rabbit: $('setNameR').value.trim() || '토끼팀', cat: $('setNameC').value.trim() || '고양이팀' } }); toast('설정을 저장했어요.'); scene.sport = null; refresh(); };
$('cStart').onclick = startGame; $('cOpen').onclick = openQuestion; $('cClose').onclick = closeNow; $('cReveal').onclick = reveal; $('cScene').onclick = playScene; $('cNext').onclick = next; $('cNextEvent').onclick = nextEvent; $('cEnd').onclick = endGame;
$('cExport').onclick = () => { try { exportResults(game.state); } catch (e) { toast('엑셀을 만들지 못했어요: ' + e.message); } };
document.addEventListener('keydown', e => { if (e.key === ' ' && e.target === document.body) { e.preventDefault(); const b = ['cOpen', 'cReveal', 'cScene', 'cNext', 'cNextEvent'].map(id => $(id)).find(x => !x.disabled && !x.hidden); if (b) b.click(); } });
window.addEventListener('beforeunload', () => { try { localStorage.setItem('olq:host:' + game.code, JSON.stringify(game.snapshot())); } catch (e) { } });
boot();
window.OLQ = { get game() { return game; }, get net() { return net; }, refresh, playScene, next, nextEvent, reveal, openQuestion, closeNow, startGame, loadSample() { $('btnSample').click(); confirmQuestions(); } };

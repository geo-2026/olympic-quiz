// 헤드리스 Chrome 통합 검증 — 관리자 1 + 학생 3 (같은 브라우저, net=local). 사용법은 tools/README.md
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8766/';
const FULL_SCENES = process.argv.includes('--scenes');
const NET = ((process.argv.find(a => a.startsWith('--net=')) || '--net=local').slice(6));   // local(기본, BroadcastChannel) | socket(server.js 중계 — BASE가 node 서버여야 함)   // 모든 장면을 끝까지 재생(느림). 기본은 첫 장면만 재생하고 나머지는 건너뜀
const DL = path.join(__dirname, 'dl'); fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const errors = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const hook = (p, tag) => { p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_INTERNET|fonts.googleapis|net::ERR/.test(m.text())) errors.push(tag + ' :: ' + m.text()); }); p.on('pageerror', e => errors.push(tag + ' :: ' + e.message)); };
// 배경 탭이 되면 헤드리스 크롬이 프레임을 멈춰 click 이 끝나지 않으므로 관리자 탭을 앞으로 가져온 뒤 누름
let admin;
const aclick = async sel => { await admin.bringToFront(); await admin.click(sel); };
const waitFor = async (page, fn, arg, timeout = 15000) => { try { await page.waitForFunction(fn, { timeout, polling: 100 }, arg); return true; } catch (e) { return false; } };

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=IntensiveWakeUpThrottling'] });
  admin = await browser.newPage(); await admin.setViewport({ width: 1600, height: 900 }); hook(admin, 'admin');
  const cdp = await admin.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
  await admin.goto(BASE + `admin.html?net=${NET}`, { waitUntil: 'networkidle0' });
  await admin.evaluate(() => { localStorage.clear(); });
  await admin.goto(BASE + `admin.html?net=${NET}`, { waitUntil: 'networkidle0' });
  ok(await waitFor(admin, () => /^\d{4}$/.test(document.getElementById('roomCode').textContent)), '관리자 : 방 코드 생성');
  const code = await admin.$eval('#roomCode', e => e.textContent);
  ok(await waitFor(admin, () => document.getElementById('net').className === 'open'), '관리자 : 호스트 연결(open) · 코드 ' + code);
  ok((await admin.$eval('#joinUrl', e => e.textContent)).includes('play.html?room=' + code), '관리자 : 입장 주소에 방 코드');
  ok(await admin.$('#qr img, #qr canvas'), '관리자 : QR 생성');

  // 문항 : 예시 불러오기 → 14문항, 유형 번갈아 → 확정
  const tab = async name => { await admin.bringToFront(); await admin.click(`#panel .tabs button[data-tab="${name}"]`); await sleep(100); };
  await tab('questions'); await aclick('#btnSample'); await sleep(300);
  await admin.select('#qMix', 'interleave'); await admin.$eval('#qLimit', e => { e.value = '14'; e.dispatchEvent(new Event('input')); }); await sleep(200);
  const evPrev = await admin.$eval('#evTable', e => e.innerText);
  ok(evPrev.includes('줄다리기') && evPrev.includes('1~3') && evPrev.includes('양궁') && evPrev.includes('13~14') && !evPrev.includes('사격'), '문항 : 종목 배정 미리보기 (14문항 → 양궁 2발, 사격 없음)');
  ok(!(await admin.$eval('#btnConfirmQ', b => b.disabled)), '문항 : 오류 없음 → 확정 버튼 활성');
  await aclick('#btnConfirmQ'); await sleep(300);
  const qs = await admin.evaluate(() => OLQ.game.state.questions.map(q => ({ no: q.no, type: q.type, answers: q.answers, limit: q.limit })));
  ok(qs.length === 14 && qs[0].type === 'ox' && qs[1].type === 'choice' && qs[2].type === 'short' && qs[2].limit === 40, '문항 : 14개 확정, 유형 번갈아, 주관식 40초 : ' + qs.slice(0, 3).map(q => q.type).join(','));
  ok(await admin.$eval('#cStart', b => b.disabled), '게임 시작 버튼은 학생 0명이면 비활성');

  // 오류 파일 검증 : 보기 3개 행이 섞인 시트를 메모리에서 읽기
  const errTest = await admin.evaluate(async () => { const m = await import('./js/excel.js'); const r = m.rowsToQuestions([{ name: 'S', rows: [['번호', '유형', '문제', '보기1', '보기2', '보기3', '보기4', '정답'], [1, 'OX', '문제', '', '', '', '', 'O'], [2, '선다', '문제2', 'a', 'b', 'c', '', '1']] }]); return { errors: r.errors, e: r.parsed[1].errors }; });
  ok(errTest.errors === 1 && /보기/.test(errTest.e[0]), '문항 : 오류 행(보기 3개) 표시 · 확정 막힘');

  // 학생 3명 입장
  const students = [];
  const names = [['10201', '김토끼'], ['10202', '이고양'], ['10203', '박지리']];
  for (const [no, name] of names) {
    const p = await browser.newPage(); await p.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true }); hook(p, name);
    await p.goto(BASE + `play.html?net=${NET}&room=${code}`, { waitUntil: 'networkidle0' });
    await p.$eval('#inNo', (e, v) => { e.value = v; }, no); await p.$eval('#inName', (e, v) => { e.value = v; }, name); await p.click('#btnJoin');
    const joined = await waitFor(p, () => window.OLQS && OLQS.me && OLQS.view && OLQS.view.phase === 'LOBBY');
    const me = joined ? await p.evaluate(() => OLQS.me) : null;
    ok(joined && me.team, `학생 ${name} 입장 → ${me && me.team}`);
    students.push({ p, no, name, team: me && me.team });
  }
  const counts = await admin.evaluate(() => OLQ.game.counts());
  ok(Math.abs(counts.rabbit - counts.cat) <= 1, '팀 배정 : 인원 차이 1명 이하 ' + JSON.stringify(counts));
  // 재접속 : 새로 고침해도 같은 팀
  const s0 = students[0]; await s0.p.reload({ waitUntil: 'networkidle0' });
  ok(await waitFor(s0.p, t => OLQS.me && OLQS.me.team === t, s0.team), `학생 ${s0.name} 새로 고침 → 자동 재입장, 같은 팀(${s0.team})`);
  // 잘못된 학번
  { const p = await browser.newPage(); hook(p, 'bad'); await p.goto(BASE + `play.html?net=${NET}&room=${code}`, { waitUntil: 'networkidle0' }); await p.$eval('#inNo', e => { e.value = '1234'; }); await p.$eval('#inName', e => { e.value = '오류학생'; }); await p.click('#btnJoin');
    const err = await waitFor(p, () => document.querySelector('.err') && document.querySelector('.err').textContent.includes('5자리')); ok(err, '학번 4자리 입장 거부(5자리 설정)'); await p.close(); }

  // 게임 시작
  await aclick('#cStart'); await sleep(300);
  ok(await admin.evaluate(() => OLQ.game.phase === 'READY'), '게임 시작 → READY');
  ok(await waitFor(students[1].p, () => OLQS.view.phase === 'READY' && document.body.innerText.includes('1번 문항')), '학생 : 1번 문항 준비 화면');
  ok(await admin.evaluate(() => document.getElementById('sceneFrame') && document.getElementById('sceneFrame').src.includes('scenes/tug/')), '줄다리기 장면 미리 불러오기');

  const byTeam = t => students.filter(s => s.team === t);
  let scenesPlayed = 0;
  for (let i = 0; i < 14; i++) {
    const q = qs[i];
    await aclick('#cOpen');
    ok(await waitFor(students[0].p, no => OLQS.view.phase === 'QUESTION_OPEN' && OLQS.view.question.no === no, q.no), `${q.no}번 문제 시작 → 학생 화면`);
    if (i === 0) {
      const tnum = await students[0].p.$eval('#tnum', e => +e.textContent); ok(tnum >= 13 && tnum <= 15, '학생 타이머 서버 시계 기준 ' + tnum);
      ok(!(await admin.$eval('#cClose', b => b.disabled)) && (await admin.$eval('#cReveal', b => b.disabled)), '버튼 : 지금 마감 활성, 정답 공개 비활성');
      const qpub = await students[0].p.evaluate(() => OLQS.view.question); ok(qpub.answers === undefined && qpub.explanation === undefined, '학생에게 정답·해설 없음');
    }
    if (q.type === 'short' && i === 2) { const hint = await students[0].p.$eval('.hint', e => e.textContent); ok(/ㅁ/.test(hint) && /글자/.test(hint), '주관식 글자 수 힌트 표시 : ' + hint.trim().slice(0, 30)); }
    // 답안 : 학생0 정답, 학생1 정답(느리게), 학생2 오답 (4번째 문항은 학생2 미제출 → 지금 마감)
    const correct = q.type === 'choice' ? String(q.answers[0]) : q.answers[0];
    const wrong = q.type === 'ox' ? (q.answers[0] === 'O' ? 'X' : 'O') : q.type === 'choice' ? String(q.answers[0] === 1 ? 2 : 1) : '틀린답';
    await students[0].p.evaluate(v => OLQS.submit(v), correct);
    await sleep(600);
    await students[1].p.evaluate(v => OLQS.submit(v), correct);
    if (i !== 3) await students[2].p.evaluate(v => OLQS.submit(v), wrong);
    if (i === 3) { await sleep(400); ok(await admin.evaluate(() => OLQ.game.phase === 'QUESTION_OPEN'), '미제출 학생이 있으면 열린 채 유지'); await aclick('#cClose'); }
    ok(await waitFor(admin, () => OLQ.game.phase === 'QUESTION_CLOSED'), `${q.no}번 마감 (${i === 3 ? '지금 마감' : '모두 제출 → 자동'})`);
    if (i === 0) { ok((await admin.$eval('#stage', e => e.innerText)).includes('모두 제출'), '무대 : 모두 제출! 안내'); ok(await students[0].p.evaluate(() => document.body.innerText.includes('제출 완료')), '학생 : 제출 완료 표시'); }
    await aclick('#cReveal');
    ok(await waitFor(students[0].p, no => OLQS.view.phase === 'REVEAL' && OLQS.view.result && OLQS.view.result.no === no, q.no), `${q.no}번 정답 공개 → 학생 결과`);
    const r = await admin.evaluate(() => OLQ.game.revealPayload());
    if (i === 0) {
      const my0 = await students[0].p.evaluate(() => OLQS.view.result.my), my2 = await students[2].p.evaluate(() => OLQS.view.result.my);
      ok(my0.correct && my0.score > 100 && my0.score <= 150 && !my2.correct && my2.score === 0, `학생 점수 : 정답 ${my0.score}점, 오답 ${my2.score}점`);
      const t0 = students[0].team, exp = Math.round((students.filter(s => s.team === t0).reduce((a, s) => a + 0, 0)) * 10) / 10;
      const teamT = r.teams[t0].T, tot = byTeam(t0).length; ok(teamT > 0 && r.teams[t0].total === tot, `팀 T=${teamT} (분모 팀 인원 ${tot})`);
      ok(r.bundle && r.bundle.done === 1 && r.bundle.of === 3 && r.bundle.gauge === '힘 모으기', '묶음 누적 게이지 1/3 힘 모으기');
      const stg = await admin.$eval('#stage', e => e.innerText);
      ok(stg.includes('힘 모으기 1/3'), '무대 : 누적 진행 표시');
      ok(r.secret === true && !/\d+%/.test(stg) && !stg.includes('문항 승리') && !stg.includes('평균 정답 시간') && stg.includes('경기에서 공개'), '묶음 종목 : 무대에 팀 점수·정답률(%)·문항 승리 팀 없음, 경기에서 공개 안내');
      const sv = await students[0].p.evaluate(() => OLQS.view.result);
      ok(sv.secret === true && sv.teams === undefined && sv.winner === undefined && sv.answer && sv.answer.length > 0 && sv.bundle && sv.bundle.S === undefined, '학생 : 정답은 받고 팀 통계·누적 점수는 못 받음');
      ok(await students[0].p.evaluate(() => document.body.innerText.includes('경기에서 공개') && !/\d+%/.test(document.body.innerText) && !document.body.innerText.includes('문항 승리')), '학생 화면 : 경기에서 공개 안내, 정답률(%)·문항 승리 없음');
    }
    if (i === 12) {   // 13번 = 양궁(문항별) : 그대로 공개
      const stg = await admin.$eval('#stage', e => e.innerText);
      ok(r.secret === false && stg.includes('정답률'), '문항별 종목(양궁) : 정답률·문항 승리 공개');
      const sv = await students[0].p.evaluate(() => OLQS.view.result); ok(sv.teams && sv.teams.rabbit && typeof sv.winner === 'string', '학생 : 문항별 종목은 팀 통계 표시');
    }
    const can = await admin.evaluate(() => OLQ.game.canPlayScene());
    const info = await admin.evaluate(no => { const m = OLQ.game.state.events; return m.find(e => no >= e.from && no <= e.to); }, q.no);
    const isLast = q.no === info.to;
    ok(can === (info.mode === 'perQuestion' || isLast), `${q.no}번 : 경기 보기 ${can ? '가능' : '불가'} (${info.sport} ${info.mode})`);
    if (can) {
      await aclick('#cScene');
      ok(await waitFor(admin, () => OLQ.game.phase === 'SCENE' && document.getElementById('sceneFrame').style.display === 'block'), `${info.sport} 경기 장면 재생`);
      ok(await waitFor(students[0].p, () => OLQS.view.phase === 'SCENE' && document.body.innerText.includes('앞 화면에서 경기를 보세요')), '학생 : 경기 중 안내');
      const svs = await students[0].p.evaluate(() => OLQS.view.scene); ok(svs && !svs.done && svs.winner === null && svs.result === null, '학생 : 경기 중에는 승패·기록 숨김');
      const barTxt = await admin.$eval('#scenebar', e => e.innerText); ok(info.mode === 'bundle' ? barTxt.includes('결과는 경기로') : /\d+\.\d/.test(barTxt), `장면 바 : ${info.mode === 'bundle' ? '묶음 점수 숨김' : '문항별 점수 표시'}`);
      const sc = await admin.evaluate(() => OLQ.game.state.scene);
      if (info.mode === 'bundle') ok(sc.mode === 'bundle' && sc.questions.length === 3 && sc.of === 1, `묶음 장면 : 3문항 합산 ${JSON.stringify(sc.scores)} → ${sc.winner}`); else ok(sc.mode === 'perQuestion' && sc.of === info.to - info.from + 1, `문항별 장면 : ${sc.index}/${sc.of}발 → ${sc.winner}`);
      if (FULL_SCENES || scenesPlayed === 0) { const done = await waitFor(admin, () => OLQ.game.state.scene.done, null, 90000); ok(done, `${info.sport} 장면 done 수신`);
        ok(await waitFor(students[0].p, () => OLQS.view.scene && OLQS.view.scene.done && OLQS.view.scene.result && /승|무승부/.test(document.body.innerText)), '학생 : 경기 끝 → 승패·기록 표시');
        ok((await admin.$eval('#scenebar', e => e.innerText)).includes(':'), '장면 바 : 경기 끝 → 점수 표시'); }
      else { await sleep(1500); await aclick('#btnSkipScene'); await sleep(200); }
      scenesPlayed++;
      ok(await waitFor(admin, () => !document.getElementById('cNext').disabled), '장면 끝 → 다음 문제 활성');
    }
    await aclick('#cNext'); await sleep(250);
    const ph = await admin.evaluate(() => OLQ.game.phase);
    if (isLast) {
      ok(ph === 'EVENT_SUMMARY', `${info.sport} 종료 → 종목 전환 화면`);
      const sm = await admin.evaluate(() => OLQ.game.state.summary);
      const txt = await admin.$eval('#stage', e => e.innerText);
      ok(txt.includes('앞서 있어요') || txt.includes('동점'), '전환 화면 : 점수 차이 표시 (' + sm.diff + '점)');
      ok(await waitFor(students[2].p, () => OLQS.view.phase === 'EVENT_SUMMARY' && document.body.innerText.includes('메달')), '학생 : 전환 화면');
      if (q.no === 14) { ok(sm.isFinal, '마지막 종목 → 최종 결과 안내'); }
      await aclick('#cNextEvent'); await sleep(300);
    } else ok(ph === 'READY', `${q.no}번 → 다음 문항 READY`);
  }
  // 최종 결과
  ok(await admin.evaluate(() => OLQ.game.phase === 'FINAL'), '최종 결과(FINAL)');
  const f = await admin.evaluate(() => OLQ.game.state.final);
  ok(f.events.length === 5 && f.events.every(e => e.status === 'done') && f.played === 14, '종목 5개 모두 완료, 14문항 집계');
  const sumT = Math.round(f.events.reduce((a, e) => a + e.Tsum.rabbit + e.Tsum.cat, 0) * 10) / 10, sumTot = Math.round((f.totals.rabbit + f.totals.cat) * 10) / 10;
  ok(Math.abs(sumT - sumTot) < 0.11, `최종 합계 = 종목 T 합 (${sumTot} vs ${sumT})`);
  ok(await waitFor(students[0].p, () => OLQS.view.phase === 'FINAL' && document.body.innerText.includes('내 기록')), '학생 : 최종 화면 + 내 기록');
  ok((await admin.$eval('#stage', e => e.innerText)).includes('우승') || (await admin.$eval('#stage', e => e.innerText)).includes('무승부'), '무대 : 우승 팀 표시');
  await aclick('#cExport');
  for (let i = 0; i < 20; i++) { await sleep(500); if (fs.readdirSync(DL).some(x => x.endsWith('.xlsx'))) break; }
  const xl = fs.readdirSync(DL).filter(x => x.endsWith('.xlsx'));
  ok(xl.length === 1 && xl[0].startsWith('형성평가결과_' + code), '결과 엑셀 내려받기 : ' + xl.join(','));
  if (xl[0]) { const vm = require('vm'); const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'xlsx.full.min.js'), 'utf8') + ';this.__XLSX = XLSX;', ctx); const XLSX = ctx.__XLSX; const wb = XLSX.read(fs.readFileSync(path.join(DL, xl[0])), { type: 'buffer' }); ok(wb.SheetNames.join(',') === '요약,학생별,문항별,종목별', '엑셀 시트 4개 : ' + wb.SheetNames.join(',')); const st = XLSX.utils.sheet_to_json(wb.Sheets['학생별'], { header: 1 }); ok(st.length === 4 && st[1][0] === '10201', '학생별 시트 학번 순 3명'); }
  // 양식 내려받기
  await tab('questions'); await aclick('#btnTemplate'); for (let i = 0; i < 10; i++) { await sleep(400); if (fs.existsSync(path.join(DL, '문항_양식.xlsx'))) break; } ok(fs.existsSync(path.join(DL, '문항_양식.xlsx')), '엑셀 양식 내려받기');

  // 스냅샷 복구 : 관리자 새로 고침 → 이어서 진행
  await admin.reload({ waitUntil: 'networkidle0' });
  const modalShown = await waitFor(admin, () => !document.getElementById('modal').hidden && document.getElementById('modalBox').innerText.includes('진행 중인 게임'), null, 5000);
  ok(!modalShown, 'FINAL 상태는 새 방으로 시작(이어서 안 물음)');
  // 진행 중 복구 : 새 방에서 문항 확정·학생 1명·게임 시작 뒤 새로 고침
  const code2 = await admin.$eval('#roomCode', e => e.textContent);
  await waitFor(admin, () => document.getElementById('net').className === 'open');
  await admin.evaluate(() => OLQ.loadSample()); await sleep(200);
  const p2 = await browser.newPage(); hook(p2, 'resume'); await p2.goto(BASE + `play.html?net=${NET}&room=${code2}`, { waitUntil: 'networkidle0' }); await p2.$eval('#inNo', e => { e.value = '10301'; }); await p2.$eval('#inName', e => { e.value = '복구학생'; }); await p2.click('#btnJoin');
  ok(await waitFor(p2, () => OLQS.me && OLQS.view.phase === 'LOBBY'), '새 방 학생 입장');
  await aclick('#cStart'); await sleep(200); await aclick('#cOpen'); await sleep(300);
  await admin.reload({ waitUntil: 'networkidle0' });
  ok(await waitFor(admin, () => !document.getElementById('modal').hidden && document.getElementById('modalBox').innerText.includes('진행 중인 게임'), null, 5000), '새로 고침 → 이어서 진행 확인 상자');
  await admin.evaluate(() => [...document.querySelectorAll('#modalBox button')].find(b => b.textContent.includes('이어서')).click());
  ok(await waitFor(admin, () => window.OLQ && OLQ.game && OLQ.game.code === document.getElementById('roomCode').textContent && ['QUESTION_OPEN', 'QUESTION_CLOSED'].includes(OLQ.game.phase)), '복구 : 같은 방 코드·진행 중 문항 유지 (' + (await admin.evaluate(() => OLQ.game.phase)) + ')');
  ok(await waitFor(p2, () => OLQS.view && ['QUESTION_OPEN', 'QUESTION_CLOSED'].includes(OLQS.view.phase) && OLQS.view.question && OLQS.view.question.no === 1, null, 20000), '복구 뒤 학생 자동 재접속 · 1번 문항 유지');

  console.log('\n콘솔 오류 :', errors.length); errors.forEach(e => console.log('  -', e));
  ok(errors.length === 0, '콘솔 오류 0건');
  await browser.close();
  console.log(fails ? `\n실패 ${fails}건` : '\n모두 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

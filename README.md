# 통합사회 올림픽 형성평가 게임 (토끼팀 대 고양이팀)

형성평가를 팀 대항 올림픽 경기로 진행하는 교실용 웹앱입니다. 학생이 문항을 풀면 팀 점수(정답률·입력 시간)가 쌓이고, 종목마다 블록 캐릭터가 경기를 치릅니다.

- **고정 주소 1 (Render 서버, 권장)** : `https://olympic-quiz.onrender.com/` — sl-game2와 같은 Express + Socket.IO 서버. 아래 「온라인 배포 (Render)」대로 한 번 연결해 두면 이 주소가 고정됩니다.
  - 교사 : `/admin.html` · 학생 : `/play.html` (관리자 화면의 QR·주소로 들어오면 방 코드가 자동 입력) · 상태 : `/healthz`
- **고정 주소 2 (GitHub Pages, 서버 없음)** : https://geo-2026.github.io/olympic-quiz/ — 같은 파일을 정적으로 배포. 서버가 없으므로 PeerJS(WebRTC) 직접 연결로 동작합니다.
  - 교사 : https://geo-2026.github.io/olympic-quiz/admin.html · 학생 : https://geo-2026.github.io/olympic-quiz/play.html
- 명세서 : `docs/SPEC.md` (원본 `통합사회_올림픽_형성평가_게임_명세서.md`)
- 예시 문항 : `questions/통합사회_인권보장을위한헌법의역할_문항.xlsx` (OX 15 · 선택형 15 · 단답형 15). 앱의 [문항] 탭 → [예시 문항 불러오기]로 바로 쓸 수 있음

## 온라인 배포 (Render) — sl-game2와 같은 방식

이 저장소에는 `render.yaml`(Blueprint)과 `server.js`(Express + Socket.IO)가 들어 있습니다.

1. <https://render.com> 가입/로그인 (GitHub 계정 geo-2026으로)
2. **New → Blueprint** → GitHub 저장소 `geo-2026/olympic-quiz` 선택 → **Apply**
3. 배포가 끝나면 주소가 발급됩니다 : `https://olympic-quiz.onrender.com` (이름이 이미 쓰이면 `olympic-quiz-xxxx.onrender.com`처럼 뒤에 문자가 붙음)
   - 교사 : `.../admin.html` · 학생 : `.../play.html` (관리자 화면에서 QR·링크 자동 생성)
4. 발급된 주소가 `olympic-quiz.onrender.com`이 아니면 `js/config.js`의 `RELAY_URL`에 그 주소를 적고 푸시하세요(그러면 GitHub Pages 주소에서 열어도 서버를 씁니다).
5. 이후에는 `git push origin main`만 하면 Render가 자동 재배포합니다(`autoDeploy: true`).

> 무료 플랜은 15분 동안 접속이 없으면 잠들었다가 첫 접속에서 30초~1분가량 깨어나는 시간이 있습니다. **수업 1~2분 전에 관리자 화면을 먼저 열어 깨워 두세요.** 잠든 사이 학생 화면은 "다시 연결 중"으로 기다렸다가 자동으로 붙습니다.

### 교사 PC에서 직접 실행 (명세서 2.2 방법 B)
```
npm install
npm start            # http://localhost:3000  (교사 /admin.html · 학생 /play.html)
```
같은 와이파이의 학생은 `http://<교사PC IP>:3000/play.html`로 접속합니다(Windows 방화벽에서 Node 허용 필요).

## 동작 방식 (명세서 2장과 다른 점)

명세서는 서버가 게임 상태를 갖는 구조이지만, 이 구현은 **교사 브라우저가 게임 진행·채점을 맡고(호스트)** 서버는 **방 코드별 메시지 중계**만 합니다. 그래서 같은 파일이 Render(서버 있음)와 GitHub Pages(서버 없음) 양쪽에서 동작합니다.

| 항목 | 구현 |
| --- | --- |
| 실시간 통신 (기본) | **Socket.IO 중계** (`server.js`). 교사 화면이 `host:open`으로 방 코드를 등록하고, 학생은 `client:hello`로 그 방에 붙음. 서버는 메시지를 전달만 하고 저장하지 않음. 교사 화면이 새로 고침되어도 같은 코드로 이어받음(호스트 키) |
| 실시간 통신 (대체) | **PeerJS 1.5.4** (WebRTC 데이터 채널, 공개 신호 서버 `0.peerjs.com`). 서버가 없는 주소(GitHub Pages)에서 열었거나 중계 서버에 7초 안에 연결되지 않으면 자동 전환. 방 코드 → 호스트 ID `olq26-<코드>-host`. 입장 주소에 `net=peer`가 붙어 학생도 같은 방식으로 연결 |
| 전송 방식 선택 | `?net=socket|peer|local`로 고정할 수 있고, 없으면 페이지를 서빙하는 서버(또는 `js/config.js`의 `RELAY_URL`)가 있으면 socket, 아니면 peer |
| 상태 기준 | 교사 브라우저의 `js/core/game.js`. 타이머도 호스트 시계 기준(`serverNow`로 보정) |
| 저장·복구 | 호스트 `localStorage`에 방 스냅샷(1초 이하 간격). 관리자 화면을 새로 고치면 “이어서 진행” 확인 상자 → 학생 자동 재접속 |
| 관리자 비밀번호 | 없음. 방 코드는 먼저 등록한 교사 화면만 쓸 수 있고(다른 화면은 새 코드 발급), 학생은 코드만 알면 입장 |
| 같은 기기 시연·자동 테스트 | `?net=local` (BroadcastChannel, 같은 브라우저의 탭끼리) |

**주의** : 수업 중 관리자 탭을 닫으면 학생 연결이 끊깁니다(다시 열고 “이어서 진행”을 누르면 학생이 자동 재접속). PeerJS 모드는 학교 네트워크가 WebRTC(UDP)를 막으면 연결되지 않을 수 있으니, 교실에서는 Render 주소(서버 중계)를 쓰세요.

## 수업 흐름

1. 교사 PC(크롬·엣지)에서 `admin.html`을 열면 방 코드와 QR이 생깁니다. [🔇 소리 켜기]를 한 번 눌러 소리를 허용합니다.
2. [문항] 탭 : 엑셀 업로드([엑셀 양식 내려받기]로 양식 확인) 또는 [예시 문항 불러오기] → 사용할 문항 수·유형 섞기 선택 → [이 문항으로 확정]. 종목 배정 미리보기가 함께 나옵니다.
3. 학생은 QR → 학번(기본 5자리)·이름 입력 → 인원이 적은 팀에 자동 배정. [학생·팀] 탭에서 ⇄로 옮기거나 다시 섞을 수 있습니다(시작 전).
4. [게임 시작] → 문항마다 [문제 시작] → (모두 제출하면 자동 마감 / [지금 마감]) → [정답 공개] → 묶음 종목은 3번째 문항 뒤, 문항별 종목은 문항마다 [경기 보기] → [다음 문제]. 종목이 끝나면 전환 화면(점수 차이) → [다음 종목 시작].
5. 마지막 종목 뒤 최종 결과 → [결과 엑셀 내려받기](요약·학생별·문항별·종목별). [게임 종료]는 언제든 최종 결과로 이동(진행 중 문항 제외, 부분 진행 종목 표시).
6. 스페이스 키 = 지금 눌러야 할 진행 버튼.

## 종목·점수 규칙 (명세서 1·8·9장 그대로)

- 줄다리기 1~3, 스키점프 4~6, 스켈레톤 7~9, 멀리뛰기 10~12 (묶음 : 3문항 T 합 S로 경기 1회), 양궁 13~22, 사격 23~ (문항별 1발).
- 학생 점수 = 정답이면 100 + 50 × 남은 시간 비율. 팀 문항 점수 T = 팀 학생 점수 합 ÷ 팀 인원(미제출 포함).
- 경기 기록은 `js/core/sceneResults.js`가 만들고, 점수가 큰 팀이 항상 이깁니다.

## 폴더

```
olympic-quiz/
├─ index.html · admin.html · play.html        # 안내 · 관리자 · 학생
├─ js/core/  scoring.js events.js sceneResults.js questions.js game.js   # 순수 로직 (node:test)
├─ server.js · render.yaml                  # Express + Socket.IO 중계 서버, Render Blueprint
├─ js/       admin.js play.js net.js(socket|peer|local) config.js(RELAY_URL) audio.js timer.js faces.js excel.js sampleQuestions.js
├─ css/      common.css admin.css play.css
├─ lib/      socket.io.min.js peerjs.min.js xlsx.full.min.js qrcode.min.js
├─ scenes/   lib/(three.min.js r128, duel-common.js, duel.css) tug/ skijump/ skeleton/ longjump/ archery/ pistol/
├─ questions/  예시 문항 엑셀
├─ tests/    *.test.js           # npm test
├─ tools/    e2e-test.cjs README.md  # 헤드리스 Chrome 통합 검증
└─ docs/SPEC.md
```

## 경기 장면

- 양궁·사격·스키점프는 기존 장면 키트(three.js r128)에 `?mode=app`(결과 재생 모드)을 추가한 것, 줄다리기·스켈레톤·멀리뛰기는 같은 블록 캐릭터로 새로 만든 것입니다.
- 모든 장면은 `postMessage({type:'<장면>', action:'playResult', ...})`를 받아 정해진 기록을 재생하고, 끝나면 `{type:'<장면>:event', event:'done'}`을 보냅니다. 각 장면을 직접 열면 무작위 결과로 시연됩니다.

## 테스트

```
npm test                                   # 단위 테스트 22개 (채점·종목·기록·엑셀 변환·상태 전이)
npm start                                  # 서버 중계 경로 검증용 (http://127.0.0.1:3000)
cd tools ; node e2e-test.cjs http://127.0.0.1:3000/ --net=socket   # 관리자 1 + 학생 3 통합, Socket.IO 중계 (puppeteer-core 필요, NODE_PATH 설정은 tools/README.md)
python -m http.server 8766 --bind 127.0.0.1
cd tools ; node e2e-test.cjs http://127.0.0.1:8766/                # 같은 검사를 서버 없이(BroadcastChannel)
```

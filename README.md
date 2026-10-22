# 통합사회 올림픽 형성평가 게임 (토끼팀 대 고양이팀)

형성평가를 팀 대항 올림픽 경기로 진행하는 교실용 웹앱입니다. 학생이 문항을 풀면 팀 점수(정답률·입력 시간)가 쌓이고, 종목마다 블록 캐릭터가 경기를 치릅니다.

- **고정 주소 (GitHub Pages)** : https://geo-2026.github.io/olympic-quiz/
  - 교사 : https://geo-2026.github.io/olympic-quiz/admin.html
  - 학생 : https://geo-2026.github.io/olympic-quiz/play.html (관리자 화면의 QR·주소로 들어오면 방 코드가 자동 입력)
- 명세서 : `docs/SPEC.md` (원본 `통합사회_올림픽_형성평가_게임_명세서.md`)
- 예시 문항 : `questions/통합사회_인권보장을위한헌법의역할_문항.xlsx` (OX 15 · 선택형 15 · 단답형 15). 앱의 [문항] 탭 → [예시 문항 불러오기]로 바로 쓸 수 있음

## 서버 없이 동작하는 방식 (명세서 2장과 다른 점)

명세서는 Node + Socket.IO 서버(Render 배포)를 권장하지만, 이 구현은 **정적 파일만으로 GitHub Pages에 배포**되고 **교사 브라우저가 서버 역할(호스트)** 을 합니다.

| 항목 | 구현 |
| --- | --- |
| 실시간 통신 | PeerJS 1.5.4 (WebRTC 데이터 채널). 신호 서버는 공개 `0.peerjs.com`, STUN은 Google 공개 서버. 방 코드 → 호스트 ID `olq26-<코드>-host` |
| 상태 기준 | 교사 브라우저의 `js/core/game.js` (서버 메모리 대신). 타이머도 호스트 시계 기준(`serverNow`로 보정) |
| 저장·복구 | 호스트 `localStorage`에 방 스냅샷(1초 이하 간격). 관리자 화면을 새로 고치면 “이어서 진행” 확인 상자 |
| 관리자 비밀번호 | 없음. 호스트는 교사 브라우저 자체이므로 다른 사람이 그 방을 조작할 수 없음 |
| 같은 기기 시연·자동 테스트 | `?net=local` (BroadcastChannel, 같은 브라우저의 탭끼리) |

**주의** : 수업 중 관리자 탭을 닫으면 학생 연결이 끊깁니다(다시 열고 “이어서 진행”을 누르면 학생이 자동 재접속). 학교 네트워크가 WebRTC(UDP)나 `0.peerjs.com`을 막으면 연결되지 않을 수 있으니 수업 전에 휴대폰 1대로 접속을 확인하세요. 안 되면 명세서 2.2의 Node 서버 방식으로 바꿔야 합니다(미구현).

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
├─ js/       admin.js play.js net.js audio.js timer.js faces.js excel.js sampleQuestions.js
├─ css/      common.css admin.css play.css
├─ lib/      peerjs.min.js xlsx.full.min.js qrcode.min.js
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
python -m http.server 8766 --bind 127.0.0.1
cd tools ; node e2e-test.cjs http://127.0.0.1:8766/   # 관리자 1 + 학생 3 통합 (puppeteer-core 필요, NODE_PATH 설정은 tools/README.md)
```

# 헤드리스 Chrome 통합 검증

1. 빈 폴더에서 `npm init -y && npm i puppeteer-core@23`
2. `olympic-quiz` 폴더에서 `python -m http.server 8766 --bind 127.0.0.1`
3. 그 폴더에 `e2e-test.js`를 복사한 뒤 `node e2e-test.js http://127.0.0.1:8766/` (배포 확인은 `node e2e-test.js https://geo-2026.github.io/olympic-quiz/`)
   - `--scenes`를 붙이면 경기 장면 5개를 끝까지 재생(소프트웨어 GL이라 느림). 기본은 첫 장면(줄다리기)만 끝까지 재생하고 나머지는 [건너뛰기]
4. Chrome 경로 : `C:/Program Files/Google/Chrome/Application/chrome.exe`

검사 항목 : 방 코드·QR·입장 주소, 예시 문항 14개 확정(유형 번갈아)·종목 배정 미리보기·오류 행 검출, 학생 3명 입장·팀 배정·새로 고침 재입장·학번 자릿수 거부, 14문항 전체 진행(타이머·정답 비공개·힌트·자동 마감·지금 마감·정답 공개·학생 점수·팀 T·누적 게이지·경기 보기 가능 조건·장면 done·종목 전환 점수 차이·최종 결과), 결과 엑셀(시트 4개)·양식 내려받기, 관리자 새로 고침 → 이어서 진행 → 학생 자동 재접속, 콘솔 오류 0건.

- 같은 브라우저 안에서 `?net=local`(BroadcastChannel)로 통신하므로 PeerJS 서버가 없어도 돌아갑니다.
- 헤드리스 크롬은 배경 탭의 프레임을 멈추기 때문에 관리자 탭을 `bringToFront()` 한 뒤 클릭합니다.
- 다운로드 파일은 `dl/` 폴더에 저장됩니다.

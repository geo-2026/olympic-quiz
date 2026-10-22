# 헤드리스 Chrome 통합 검증 (`tools/e2e-test.cjs`)

> 스크립트는 CommonJS(`.cjs`)입니다. `package.json`이 `"type":"module"`이라 `.js`로 두면 `require`가 막혀 실행되지 않습니다.

1. puppeteer-core 설치(프로젝트 밖 아무 폴더, 한 번만). 예 : `C:\Users\Administrator\e2e-deps`
   ```
   mkdir C:\Users\Administrator\e2e-deps ; cd C:\Users\Administrator\e2e-deps ; npm init -y ; npm i puppeteer-core@23
   ```
2. `olympic-quiz` 폴더에서 로컬 서버 : `python -m http.server 8766 --bind 127.0.0.1`
3. 다른 터미널에서 `olympic-quiz\tools` 폴더로 가서 실행(NODE_PATH로 1번 폴더의 node_modules를 알려 줌)
   - PowerShell : `$env:NODE_PATH="C:\Users\Administrator\e2e-deps\node_modules"; node e2e-test.cjs http://127.0.0.1:8766/`
   - 서버 중계 경로 : `npm start`(포트 3000)를 띄운 뒤 `node e2e-test.cjs http://127.0.0.1:3000/ --net=socket` (Render 배포 확인은 `node e2e-test.cjs https://olympic-quiz.onrender.com/ --net=socket`)
   - 정적 배포 확인 : `node e2e-test.cjs https://geo-2026.github.io/olympic-quiz/`
   - `--scenes`를 붙이면 경기 장면 5개를 끝까지 재생(소프트웨어 GL이라 느림). 기본은 첫 장면(줄다리기)만 끝까지 재생하고 나머지는 [건너뛰기]
4. Chrome 경로 : `C:/Program Files/Google/Chrome/Application/chrome.exe` (스크립트 안에 고정)

검사 항목 : 방 코드·QR·입장 주소, 예시 문항 14개 확정(유형 번갈아)·종목 배정 미리보기·오류 행 검출, 학생 3명 입장·팀 배정·새로 고침 재입장·학번 자릿수 거부, 14문항 전체 진행(타이머·정답 비공개·힌트·자동 마감·지금 마감·정답 공개·학생 점수·팀 T·누적 게이지·경기 보기 가능 조건·장면 done·종목 전환 점수 차이·최종 결과), 결과 엑셀(시트 4개)·양식 내려받기, 관리자 새로 고침 → 이어서 진행 → 학생 자동 재접속, 콘솔 오류 0건.

- 기본(`--net=local`)은 같은 브라우저 안에서 BroadcastChannel로 통신하므로 서버가 없어도 돌아갑니다. `--net=socket`은 BASE가 `server.js`(node)여야 합니다.
- 헤드리스 크롬은 배경 탭의 프레임을 멈추기 때문에 관리자 탭을 `bringToFront()` 한 뒤 클릭합니다.
- 다운로드 파일은 `tools/dl/` 폴더에 저장됩니다(.gitignore에 포함).

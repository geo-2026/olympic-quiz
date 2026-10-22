/* 중계 서버(server.js) 주소.
   - 비워 두면 : 이 페이지를 server.js가 서빙 중이면(Render·npm start) 같은 주소의 서버를 쓰고,
                 GitHub Pages(정적)에서 열었으면 PeerJS(WebRTC) 직접 연결로 동작한다.
   - Render 배포 뒤 GitHub Pages 주소(geo-2026.github.io)에서도 서버를 쓰려면 아래에 Render 주소를 적는다.
     예 : export const RELAY_URL = 'https://olympic-quiz.onrender.com'; */
export const RELAY_URL = '';

# 자료정리함

사용자가 제공한 HTML을 바탕으로 GitHub Pages에서 화면을 제공하고 Firebase Authentication·Cloud Firestore로 계정별 자료를 저장합니다.

- Google 로그인 후 관리자가 허용한 계정만 자료를 읽고 쓸 수 있습니다.
- 기존 자료는 공개 코드에 포함하지 않습니다. 로그인 후 백업 JSON을 링크 입력 칸에 붙여 넣고 목록 추가를 누르면 Firebase로 가져옵니다. 기존 ID를 덮어쓰지 않으며 자동 재등록하지 않습니다.
- 원문·요약·즐겨찾기·분류를 보존합니다. AI 자동 요약 서버는 아직 연결하지 않았습니다.
- 연결 실패를 브라우저 저장 성공으로 처리하지 않습니다. 오프라인 자동 저장은 지원하지 않습니다.
- Firebase 공개 웹 설정은 `firebase-config.js`, 서버 접근 제한은 `firestore.rules`에 있습니다. 서비스 계정 비밀키나 AI API 키를 넣지 않습니다.
- 브라우저의 기존 파일 주소에서 추가한 자료는 해당 브라우저 저장소에 있습니다. HTML에 포함되지 않은 자료는 별도 백업·가져오기가 필요합니다.
- 팀 공용 목록은 이번 버전에 포함하지 않습니다. 같은 Google 계정으로 로그인한 기기 사이에서 같은 자료를 봅니다.

## 운영

Firebase 프로젝트: `jaryo-shelf`. Firestore `(default)`, 서울 `asia-northeast3`, Spark 요금제.

Google 로그인 사용 설정 및 `poursolution.github.io` 승인 도메인 등록이 필요합니다. 첫 앱 로그인 후 Firebase Authentication에서 UID를 확인하고 관리자가 `allowedUsers/{uid}` 문서를 만들면 해당 계정에 접근을 허용합니다. 클라이언트는 스스로 허용 계정을 추가할 수 없습니다.

GitHub Pages: `main` 브랜치의 루트에서 게시합니다.

로그아웃·백업/가져오기 버튼의 표시 위치는 디자인 인계 대상으로 남아 있습니다. 관련 기능은 `firebase-store.js`의 `logout`, `exportBackup`, `localBackup`, `importBackup` 함수로 준비했습니다.

## 검사

`node store.test.cjs`

모의 SDK 기반 검사입니다. 실제 Firebase 권한·Google 로그인·기기 간 동기화는 운영 환경에서 별도로 확인해야 합니다.

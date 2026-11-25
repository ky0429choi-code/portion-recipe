/**
 * 공개 설정 — GitHub에 올라가는 값이므로 비밀값을 넣지 않는다.
 * API_URL: GAS 웹앱 배포 주소(/exec). 주소가 알려져도 로그인 토큰 없이는 데이터가 나오지 않는다.
 * 비워 두면 '시연 모드'(가상 데이터, 서버 연결 없음)로 열린다.
 */
export const CONFIG = Object.freeze({
  API_URL: 'https://script.google.com/macros/s/AKfycbxr31or_O6mPO4ayOQy7bmCZmaOEnLTxJCYZDEGmjfN2yD6BCA6c9js9dFJxBtaZXII/exec',
  REQUEST_TIMEOUT_MS: 25000
});

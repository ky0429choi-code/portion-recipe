/**
 * 인당량 가이드 v3 — GitHub Pages 화면 + GAS 게이트 API
 * 서버 비밀값(SHEET_ID 등)은 Script Properties에만 둔다. 코드·GitHub에 넣지 않는다.
 */
var APP_VERSION = '3.0.0-pages';

var DB_TAB = Object.freeze({
  config: 'CONFIG',
  portions: 'PORTIONS',
  recipes: 'RECIPES',
  feedback: 'FEEDBACK',
  audit: 'AUDIT_LOG',
  users: 'USERS',
  sessions: 'SESSIONS'
});

/** 업무 데이터 탭 최대 조회 행. 계정·세션 탭은 제한하지 않는다(0 = 전체). */
var MAX_ROWS = 2500;

var AUTH = Object.freeze({
  SESSION_TTL_MIN: 480,   // 로그인 유지 8시간
  MAX_FAIL: 5,            // 연속 실패 허용 횟수
  LOCK_MIN: 15,           // 잠금 시간(분)
  PBKDF2_ITER: 1000,      // 기본 해시 반복 횟수(속도 우선: 약 1초). Script Property PBKDF2_ITER로 조정. 기존 해시는 로그인 때 자동 갱신
  MIN_PW_LEN: 4,          // 사용자 요청(2026-11-25): 4자리부터 허용. 무차별 대입은 5회 잠금으로 제한
  TEMP_PW_HOURS: 72       // 임시 비밀번호 유효 시간
});

var ROLES = Object.freeze({ ADMIN: 'ADMIN', USER: 'USER' });

var LOGIN_FAIL_MSG = '아이디 또는 비밀번호가 올바르지 않습니다.';

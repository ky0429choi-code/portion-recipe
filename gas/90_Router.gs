/**
 * 외부(GitHub Pages)에서 들어오는 유일한 입구.
 * 요청: POST, Content-Type text/plain, 본문 {"action":"...","token":"...","payload":{...}}
 *  - text/plain이라 브라우저 사전요청(preflight)이 없다.
 *  - 토큰·비밀번호는 URL에 넣지 않는다(서버 로그·방문 기록 노출 방지).
 * 응답: {"ok":true,"data":...} 또는 {"ok":false,"code":"...","message":"..."}
 */
var PUBLIC_ACTIONS = Object.freeze({ health: true, login: true });
/** 비밀번호 변경 전(임시 비밀번호 상태)에 허용되는 동작 */
var PRECHANGE_ACTIONS = Object.freeze({ session: true, changePassword: true, logout: true });

function routes_() {
  return {
    health: function () { return { service: 'portion-guide-api', version: APP_VERSION }; },
    login: apiLogin_,
    logout: apiLogout_,
    session: apiSession_,
    changePassword: apiChangePassword_,
    bootstrap: apiBootstrap_,
    suggestion: apiSuggestion_,
    // 관리자 화면 (각 함수 안에서 ADMIN 권한 확인)
    adminListUsers: apiAdminListUsers_,
    adminCreateUser: apiAdminCreateUser_,
    adminUpdateUser: apiAdminUpdateUser_,
    adminResetPassword: apiAdminResetPassword_,
    adminSetStatus: apiAdminSetStatus_,
    adminUnlock: apiAdminUnlock_
  };
}

function handleRequest_(body) {
  var req;
  if (str_(body).length > 20000) return fail_('BAD_REQUEST', '요청이 너무 큽니다.');
  try { req = JSON.parse(str_(body) || '{}'); } catch (e) { return fail_('BAD_REQUEST', '요청 형식이 올바르지 않습니다.'); }
  if (!req || typeof req !== 'object' || Array.isArray(req)) return fail_('BAD_REQUEST', '요청 형식이 올바르지 않습니다.');

  var action = str_(req.action), routes = routes_();
  if (!Object.prototype.hasOwnProperty.call(routes, action)) return fail_('UNKNOWN_ACTION', '지원하지 않는 요청입니다.');
  var payload = req.payload && typeof req.payload === 'object' && !Array.isArray(req.payload) ? req.payload : {};

  try {
    if (action === 'health') return ok_(routes.health());
    var db = db_();
    requireAuthMode_(db);
    var ctx = null;
    if (!PUBLIC_ACTIONS[action]) {
      ctx = requireSession_(db, req.token);
      if (ctx.mustChange && !PRECHANGE_ACTIONS[action])
        throw apiError_('PASSWORD_CHANGE_REQUIRED', '임시 비밀번호를 먼저 변경해 주세요.');
    }
    return ok_(routes[action](db, payload, ctx));
  } catch (err) {
    if (err && err.code) return fail_(err.code, err.message);
    // 내부 오류 상세(스택·시트 정보)는 응답에 싣지 않는다. 요청 본문(비밀번호·토큰)은 로그에 남기지 않는다.
    console.error('[' + action + '] ' + (err && err.message ? err.message : err));
    return fail_('SERVER_ERROR', '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

function ok_(data) { return { ok: true, data: data }; }
function fail_(code, message) { return { ok: false, code: code, message: message }; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) { return json_(handleRequest_(e && e.postData ? e.postData.contents : '')); }
/** 주소를 브라우저로 열었을 때: 데이터 없이 상태만 알린다. */
function doGet() { return json_(ok_({ service: 'portion-guide-api', version: APP_VERSION, note: 'POST 전용 API입니다.' })); }

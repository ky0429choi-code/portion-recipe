/**
 * 관리자 도구 — Apps Script 편집기에서 직접 [실행]하는 함수들.
 * 라우터(90_Router)에 등록되지 않으므로 외부(GitHub Pages)에서는 호출할 수 없다.
 *
 * 계정 운영 흐름
 *  1) setupV3()            : USERS·SESSIONS 탭과 CONFIG AUTH_MODE를 (없을 때만) 만든다.
 *  2) USERS 탭에 행 추가    : userId, displayName, role(ADMIN/USER), siteScope(* 또는 사업장ID 쉼표), status=PENDING
 *  3) issueTempPasswords() : PENDING 계정에 임시 비밀번호 발급 → 실행 로그에서 확인해 본인에게 전달
 *  4) 사용자가 첫 로그인 후 비밀번호 변경 (변경 전에는 데이터 조회 불가)
 *  정지: USERS의 status를 DISABLED로 바꾸면 즉시 차단. 재발급: status를 PENDING으로 바꾸고 3) 다시 실행.
 */
function setupV3() {
  var db = db_(), log = [];
  [DB_TAB.users, DB_TAB.sessions].forEach(function (name) {
    var r = ensureTab_(db, name, NEW_TAB_HEADERS[name]);
    log.push(name + (r.created ? ' 탭 생성' : ' 탭 이미 있음(변경 안 함)'));
  });
  if (!conf_(db, 'AUTH_MODE')) {
    appendMapped_(db, DB_TAB.config, { key: 'AUTH_MODE', value: 'ACCOUNT', note: 'v3 계정 로그인 게이트' });
    log.push('CONFIG AUTH_MODE=ACCOUNT 추가');
  } else log.push('CONFIG AUTH_MODE 이미 있음: ' + conf_(db, 'AUTH_MODE'));

  var users = readRows_(db, DB_TAB.users, 0);
  if (!users.length) {
    var adminId = normId_(PropertiesService.getScriptProperties().getProperty('ADMIN_USER_ID')) || 'admin';
    appendMapped_(db, DB_TAB.users, {
      userId: adminId, displayName: '관리자', role: ROLES.ADMIN, siteScope: '*', status: 'PENDING',
      passwordHash: '', mustChange: 'TRUE', passwordSetAt: '', failCount: 0, lockedUntil: '', lastLoginAt: '', note: 'setupV3 최초 관리자'
    });
    log.push('최초 관리자 계정 추가: ' + adminId + ' (PENDING) → issueTempPasswords() 실행');
  }
  log.forEach(function (x) { Logger.log(x); });
  return log;
}

/** status=PENDING 계정에 임시 비밀번호(72시간 유효, 첫 로그인 시 변경 필수)를 발급한다. */
function issueTempPasswords() {
  var db = db_(), t = readTable_(db, DB_TAB.users, 0), issued = [];
  t.rows.forEach(function (u) {
    if (str_(u.status).trim().toUpperCase() !== 'PENDING') return;
    var id = normId_(u.userId); if (!id) return;
    var pw = tempPassword_();
    updateRow_(t, u, {
      userId: id, passwordHash: hashPassword_(pw), mustChange: 'TRUE', passwordSetAt: new Date(),
      status: 'ACTIVE', failCount: 0, lockedUntil: ''
    });
    revokeSessions_(db, { userId: id });
    audit_(db, 'ADMIN_EDITOR', 'TEMP_PASSWORD_ISSUE', id, '임시 비밀번호 발급');
    // 실행 로그는 이 프로젝트 편집 권한자만 볼 수 있다. 첫 로그인 때 반드시 바뀌는 1회용 값이다.
    Logger.log('[임시 비밀번호] ' + id + ' : ' + pw + '  (72시간 내 첫 로그인 후 변경)');
    issued.push(id);
  });
  if (!issued.length) Logger.log('PENDING 상태 계정이 없습니다.');
  return issued.length;
}

/** 모든 로그인 세션을 끊는다(분실·유출 의심 시). */
function revokeAllSessions() {
  var n = revokeSessions_(db_(), { all: true });
  audit_(db_(), 'ADMIN_EDITOR', 'SESSION_REVOKE_ALL', '', n + '건');
  Logger.log('세션 ' + n + '건 종료');
  return n;
}

/** 탭·설정·건수 점검. 데이터 내용은 출력하지 않는다. */
function checkHealth() {
  var db = db_(), need = ['CONFIG', 'PORTIONS', 'RECIPES', 'FEEDBACK', 'AUDIT_LOG', 'USERS', 'SESSIONS'];
  var have = db.getSheets().map(function (s) { return s.getName(); });
  var missing = need.filter(function (x) { return have.indexOf(x) < 0; });
  var out = { version: APP_VERSION, missingTabs: missing, authMode: missing.indexOf('CONFIG') < 0 ? conf_(db, 'AUTH_MODE') : '' };
  if (!missing.length) {
    out.portions = readRows_(db, DB_TAB.portions).length;
    out.recipes = readRows_(db, DB_TAB.recipes).length;
    var users = readRows_(db, DB_TAB.users, 0);
    out.users = { total: users.length, active: users.filter(function (u) { return str_(u.status).toUpperCase() === 'ACTIVE'; }).length };
  }
  Logger.log(JSON.stringify(out));
  return out;
}

/** 로그인 1회 해시 시간 측정. 1초를 크게 넘으면 Script Property PBKDF2_ITER를 낮춘다(최소 1000). */
function measureHashSpeed() {
  var t0 = Date.now(); hashPassword_('measure-only-123'); var ms = Date.now() - t0;
  Logger.log('PBKDF2 ' + pbkdf2Iter_() + '회: ' + ms + 'ms');
  return ms;
}

/** 로그인·로그아웃·세션 확인·비밀번호 변경 API */
function apiLogin_(db, p) {
  var id = normId_(p.userId), pw = str_(p.password);
  if (!id || id.length > 64 || !pw || pw.length > 128) throw apiError_('LOGIN_FAILED', LOGIN_FAIL_MSG);

  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var now = Date.now(), found = findUser_(db, id);
    if (!found) { audit_(db, id, 'LOGIN_FAIL', '', '등록되지 않은 아이디'); throw apiError_('LOGIN_FAILED', LOGIN_FAIL_MSG); }
    var u = found.row;
    if (str_(u.status).trim().toUpperCase() !== 'ACTIVE' || !str_(u.passwordHash)) {
      audit_(db, id, 'LOGIN_FAIL', '', '비활성 또는 비밀번호 미발급 계정');
      throw apiError_('LOGIN_FAILED', LOGIN_FAIL_MSG);
    }
    if (toMs_(u.lockedUntil) > now)
      throw apiError_('LOGIN_LOCKED', '로그인 실패가 반복되어 잠시 잠겼습니다. ' + AUTH.LOCK_MIN + '분 후 다시 시도해 주세요.');

    if (!verifyPassword_(pw, u.passwordHash)) {
      var fails = (num_(u.failCount) || 0) + 1, patch = { failCount: fails };
      var locked = fails >= AUTH.MAX_FAIL;
      if (locked) { patch.failCount = 0; patch.lockedUntil = new Date(now + AUTH.LOCK_MIN * 60000); }
      updateRow_(found.table, u, patch);
      audit_(db, id, locked ? 'LOGIN_LOCK' : 'LOGIN_FAIL', '', locked ? '연속 실패로 잠금' : '비밀번호 불일치');
      if (locked) throw apiError_('LOGIN_LOCKED', '로그인 실패가 반복되어 ' + AUTH.LOCK_MIN + '분 동안 잠겼습니다.');
      throw apiError_('LOGIN_FAILED', LOGIN_FAIL_MSG);
    }

    if (bool_(u.mustChange) && now - toMs_(u.passwordSetAt) > AUTH.TEMP_PW_HOURS * 3600000) {
      audit_(db, id, 'LOGIN_FAIL', '', '임시 비밀번호 만료');
      throw apiError_('TEMP_EXPIRED', '임시 비밀번호 유효기간이 지났습니다. 관리자에게 재발급을 요청하세요.');
    }

    var okPatch = { failCount: 0, lockedUntil: '', lastLoginAt: new Date(now) };
    // 해시 반복 횟수 설정이 바뀌었으면(예: 3000→1000) 맞는 비밀번호로 로그인한 지금 새 설정으로 다시 저장
    if (str_(u.passwordHash).split('$')[1] !== String(pbkdf2Iter_())) okPatch.passwordHash = hashPassword_(pw);
    updateRow_(found.table, u, okPatch);
    if (Math.random() < 0.1) purgeSessions_(db); // 만료 세션 정리는 가끔만(로그인 속도)
    var s = createSession_(db, id);
    audit_(db, id, 'LOGIN', '', '로그인');
    var ctx = ctxFromUser_(u, sha256Hex_(s.token));
    var out = { token: s.token, expiresAt: s.expiresAt, user: publicUser_(ctx) };
    // 왕복 1회 절약: 비밀번호 변경이 필요 없으면 데이터까지 함께 보낸다
    if (!ctx.mustChange) out.data = apiBootstrap_(db, {}, ctx);
    return out;
  } finally { lock.releaseLock(); }
}

function apiLogout_(db, p, ctx) {
  revokeSessions_(db, { tokenHash: ctx.tokenHash });
  audit_(db, ctx.userId, 'LOGOUT', '', '로그아웃');
  return { loggedOut: true };
}

function apiSession_(db, p, ctx) { return { user: publicUser_(ctx) }; }

function apiChangePassword_(db, p, ctx) {
  var cur = str_(p.currentPassword), next = str_(p.newPassword);
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var found = findUser_(db, ctx.userId);
    if (!found || !verifyPassword_(cur, found.row.passwordHash))
      throw apiError_('WRONG_PASSWORD', '현재 비밀번호가 올바르지 않습니다.');
    checkPasswordPolicy_(next, ctx.userId);
    if (next === cur) throw apiError_('WEAK_PASSWORD', '이전과 다른 비밀번호를 입력하세요.');
    updateRow_(found.table, found.row, {
      passwordHash: hashPassword_(next), mustChange: 'FALSE', passwordSetAt: new Date(), failCount: 0, lockedUntil: ''
    });
    revokeSessions_(db, { userId: ctx.userId, exceptHash: ctx.tokenHash });
    audit_(db, ctx.userId, 'PASSWORD_CHANGE', '', '비밀번호 변경');
    ctx.mustChange = false;
    return { user: publicUser_(ctx) };
  } finally { lock.releaseLock(); }
}

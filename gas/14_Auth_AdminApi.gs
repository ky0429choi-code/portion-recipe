/**
 * 관리자 화면 API — role=ADMIN 계정만 호출할 수 있다.
 * 비밀번호는 해시로만 저장하고, 응답에는 해시·토큰을 싣지 않는다. 모든 변경은 AUDIT_LOG에 남는다.
 * 안전장치: 자기 자신 정지 불가, 마지막 관리자의 권한 해제·정지 불가.
 */
var USER_ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;

function cleanRole_(v) {
  var r = str_(v).trim().toUpperCase();
  if (r !== ROLES.ADMIN && r !== ROLES.USER) throw apiError_('INVALID_INPUT', '권한은 관리자(ADMIN) 또는 사용자(USER)입니다.');
  return r;
}

function cleanScope_(v) {
  var list = scopeList_(v);
  if (list.indexOf('*') >= 0) return '*';
  list.forEach(function (s) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(s)) throw apiError_('INVALID_INPUT', '사업장 범위 형식이 올바르지 않습니다: ' + s);
  });
  return list.join(',');
}

function statusOf_(u) { return str_(u.status).trim().toUpperCase() || 'PENDING'; }

function adminUserView_(u) {
  var last = toMs_(u.lastLoginAt);
  return {
    userId: normId_(u.userId), displayName: str_(u.displayName) || normId_(u.userId),
    role: roleOf_(u.role), siteScope: str_(u.siteScope), status: statusOf_(u),
    mustChange: bool_(u.mustChange), locked: toMs_(u.lockedUntil) > Date.now(),
    passwordSet: Boolean(str_(u.passwordHash)), lastLoginAt: last ? new Date(last).toISOString() : ''
  };
}

/** exceptId를 뺀 '사용 중인 관리자' 수 */
function otherActiveAdmins_(rows, exceptId) {
  return rows.filter(function (u) {
    return normId_(u.userId) !== exceptId && roleOf_(u.role) === ROLES.ADMIN && statusOf_(u) === 'ACTIVE';
  }).length;
}

function requireTarget_(db, userId) {
  var found = findUser_(db, userId);
  if (!found) throw apiError_('NOT_FOUND', '없는 계정입니다.');
  return found;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function apiAdminListUsers_(db, p, ctx) {
  requireRole_(ctx, ROLES.ADMIN);
  return { users: readRows_(db, DB_TAB.users, 0).filter(function (u) { return normId_(u.userId); }).map(adminUserView_) };
}

function apiAdminCreateUser_(db, p, ctx) {
  requireRole_(ctx, ROLES.ADMIN);
  var id = normId_(p.userId);
  if (!USER_ID_RE.test(id)) throw apiError_('INVALID_INPUT', '아이디는 영문 소문자·숫자·. _ - 로 3~64자입니다.');
  var name = str_(p.displayName).trim().slice(0, 40) || id;
  var role = cleanRole_(p.role || ROLES.USER), scope = cleanScope_(p.siteScope), pw = str_(p.password);
  checkPasswordPolicy_(pw, id);
  return withLock_(function () {
    if (findUser_(db, id)) throw apiError_('DUPLICATE', '이미 있는 아이디입니다.');
    appendMapped_(db, DB_TAB.users, {
      userId: id, displayName: name, role: role, siteScope: scope, status: 'ACTIVE',
      passwordHash: hashPassword_(pw), mustChange: p.mustChange === false ? 'FALSE' : 'TRUE', passwordSetAt: new Date(),
      failCount: 0, lockedUntil: '', lastLoginAt: '', note: '관리자 화면 생성: ' + ctx.userId
    });
    audit_(db, ctx.userId, 'ADMIN_USER_CREATE', id, role + ' / 범위 ' + (scope || '없음'));
    return { user: adminUserView_(findUser_(db, id).row) };
  });
}

function apiAdminUpdateUser_(db, p, ctx) {
  requireRole_(ctx, ROLES.ADMIN);
  return withLock_(function () {
    var t = requireTarget_(db, p.userId), u = t.row, id = normId_(u.userId), patch = {};
    if (p.displayName !== undefined) patch.displayName = str_(p.displayName).trim().slice(0, 40) || id;
    if (p.siteScope !== undefined) patch.siteScope = cleanScope_(p.siteScope);
    if (p.role !== undefined) {
      var role = cleanRole_(p.role);
      if (role !== ROLES.ADMIN && roleOf_(u.role) === ROLES.ADMIN && otherActiveAdmins_(t.table.rows, id) === 0)
        throw apiError_('LAST_ADMIN', '마지막 관리자의 권한은 해제할 수 없습니다. 다른 관리자를 먼저 지정하세요.');
      patch.role = role;
    }
    updateRow_(t.table, u, patch);
    audit_(db, ctx.userId, 'ADMIN_USER_UPDATE', id, Object.keys(patch).join(','));
    return { user: adminUserView_(u) };
  });
}

function apiAdminResetPassword_(db, p, ctx) {
  requireRole_(ctx, ROLES.ADMIN);
  return withLock_(function () {
    var t = requireTarget_(db, p.userId), u = t.row, id = normId_(u.userId), pw = str_(p.password);
    checkPasswordPolicy_(pw, id);
    var patch = {
      passwordHash: hashPassword_(pw), mustChange: p.mustChange === false ? 'FALSE' : 'TRUE',
      passwordSetAt: new Date(), failCount: 0, lockedUntil: ''
    };
    if (statusOf_(u) === 'PENDING') patch.status = 'ACTIVE';
    updateRow_(t.table, u, patch);
    revokeSessions_(db, { userId: id, exceptHash: id === ctx.userId ? ctx.tokenHash : '' });
    audit_(db, ctx.userId, 'ADMIN_PASSWORD_RESET', id, '관리자 비밀번호 지정');
    return { user: adminUserView_(u) };
  });
}

function apiAdminSetStatus_(db, p, ctx) {
  requireRole_(ctx, ROLES.ADMIN);
  var next = str_(p.status).trim().toUpperCase();
  if (next !== 'ACTIVE' && next !== 'DISABLED') throw apiError_('INVALID_INPUT', '상태는 사용(ACTIVE) 또는 정지(DISABLED)입니다.');
  return withLock_(function () {
    var t = requireTarget_(db, p.userId), u = t.row, id = normId_(u.userId);
    if (next === 'DISABLED') {
      if (id === ctx.userId) throw apiError_('SELF_DISABLE', '자기 계정은 정지할 수 없습니다.');
      if (roleOf_(u.role) === ROLES.ADMIN && otherActiveAdmins_(t.table.rows, id) === 0)
        throw apiError_('LAST_ADMIN', '마지막 관리자는 정지할 수 없습니다.');
    } else if (!str_(u.passwordHash)) {
      throw apiError_('NO_PASSWORD', '먼저 비밀번호를 지정하세요.');
    }
    updateRow_(t.table, u, { status: next });
    if (next === 'DISABLED') revokeSessions_(db, { userId: id });
    audit_(db, ctx.userId, next === 'DISABLED' ? 'ADMIN_USER_DISABLE' : 'ADMIN_USER_ENABLE', id, '');
    return { user: adminUserView_(u) };
  });
}

function apiAdminUnlock_(db, p, ctx) {
  requireRole_(ctx, ROLES.ADMIN);
  return withLock_(function () {
    var t = requireTarget_(db, p.userId), u = t.row;
    updateRow_(t.table, u, { failCount: 0, lockedUntil: '' });
    audit_(db, ctx.userId, 'ADMIN_USER_UNLOCK', normId_(u.userId), '');
    return { user: adminUserView_(u) };
  });
}

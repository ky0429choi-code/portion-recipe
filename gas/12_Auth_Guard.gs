/**
 * 게이트: 모든 데이터 요청은 여기서 토큰 → 세션 → 현재 계정 상태를 확인한다.
 * 계정 권한·범위는 세션이 아니라 USERS 탭의 현재 값을 따른다.
 * (관리자가 USERS에서 status를 DISABLED로 바꾸면 다음 요청부터 즉시 차단)
 */
function requireAuthMode_(db) {
  if (conf_(db, 'AUTH_MODE') !== 'ACCOUNT')
    throw apiError_('CONFIG_ERROR', '서버 인증 설정이 완료되지 않았습니다.');
}

function findUser_(db, userId) {
  var id = normId_(userId); if (!id) return null;
  var t = readTable_(db, DB_TAB.users, 0);
  for (var i = 0; i < t.rows.length; i++) if (normId_(t.rows[i].userId) === id) return { table: t, row: t.rows[i] };
  return null;
}

function roleOf_(r) { return str_(r).trim().toUpperCase() === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USER; }
function scopeList_(v) { return str_(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean); }

function requireSession_(db, token) {
  var s = findSession_(db, token);
  if (!s) throw apiError_('AUTH_REQUIRED', '로그인이 필요합니다.');
  if (!bool_(s.active) || toMs_(s.expiresAt) <= Date.now())
    throw apiError_('SESSION_EXPIRED', '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.');
  var found = findUser_(db, s.userId);
  if (!found || str_(found.row.status).trim().toUpperCase() !== 'ACTIVE')
    throw apiError_('AUTH_REQUIRED', '사용할 수 없는 계정입니다. 관리자에게 문의하세요.');
  var u = found.row;
  return {
    userId: normId_(u.userId), displayName: str_(u.displayName) || normId_(u.userId),
    role: roleOf_(u.role), siteScope: scopeList_(u.siteScope),
    mustChange: bool_(u.mustChange), tokenHash: str_(s.tokenHash)
  };
}

/** 사업장 범위: '*'는 전체, 그 외에는 쉼표로 나열한 siteId만. 비어 있으면 아무것도 볼 수 없다. */
function canSeeSite_(ctx, siteId) {
  return ctx.siteScope.indexOf('*') >= 0 || ctx.siteScope.indexOf(str_(siteId)) >= 0;
}

function requireRole_(ctx, role) {
  if (ctx.role !== role) throw apiError_('FORBIDDEN', '권한이 없습니다.');
}

function publicUser_(ctx) {
  return { userId: ctx.userId, displayName: ctx.displayName, role: ctx.role, siteScope: ctx.siteScope.slice(), mustChange: ctx.mustChange };
}

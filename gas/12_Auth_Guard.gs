/**
 * 게이트: 모든 데이터 요청은 여기서 토큰 → 세션 → 현재 계정 상태를 확인한다.
 * 계정 권한·범위는 세션이 아니라 USERS 탭의 현재 값을 따른다.
 * (관리자가 USERS에서 status를 DISABLED로 바꾸면 다음 요청부터 즉시 차단)
 */
function requireAuthMode_(db) {
  if (cacheGetJson_('cfg:AUTH_MODE') === 'ACCOUNT') return;
  if (conf_(db, 'AUTH_MODE') !== 'ACCOUNT')
    throw apiError_('CONFIG_ERROR', '서버 인증 설정이 완료되지 않았습니다.');
  cachePutJson_('cfg:AUTH_MODE', 'ACCOUNT', CACHE_TTL.CONFIG);
}

/** 세션 정보(캐시 우선). 반환: {userId, exp(ms), active, tokenHash} 또는 null */
function sessionInfo_(db, token) {
  token = str_(token);
  if (!TOKEN_RE.test(token)) return null;
  var h = sha256Hex_(token), cached = cacheGetJson_('ses:' + h);
  if (cached) return cached;
  var s = findSession_(db, token);
  if (!s) return null;
  var info = { userId: normId_(s.userId), exp: toMs_(s.expiresAt), active: bool_(s.active), tokenHash: h };
  var ttl = Math.min(CACHE_TTL.SESSION, (info.exp - Date.now()) / 1000);
  if (info.active && ttl >= 1) cachePutJson_('ses:' + h, info, ttl);
  return info;
}

/** 계정 정보(캐시 우선). 화면 표시·권한 판단에 필요한 값만 담는다(해시 제외). */
function userInfo_(db, userId) {
  var id = normId_(userId), key = 'usr:' + id, cached = cacheGetJson_(key);
  if (cached) return cached;
  var found = findUser_(db, id);
  if (!found) return null;
  var u = found.row;
  var info = {
    userId: normId_(u.userId), displayName: str_(u.displayName), role: str_(u.role),
    siteScope: str_(u.siteScope), status: str_(u.status).trim().toUpperCase(), mustChange: bool_(u.mustChange)
  };
  cachePutJson_(key, info, CACHE_TTL.USER);
  return info;
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
  var s = sessionInfo_(db, token);
  if (!s) throw apiError_('AUTH_REQUIRED', '로그인이 필요합니다.');
  if (!s.active || s.exp <= Date.now())
    throw apiError_('SESSION_EXPIRED', '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.');
  var u = userInfo_(db, s.userId);
  if (!u || u.status !== 'ACTIVE')
    throw apiError_('AUTH_REQUIRED', '사용할 수 없는 계정입니다. 관리자에게 문의하세요.');
  return ctxFromUser_(u, s.tokenHash);
}

function ctxFromUser_(u, tokenHash) {
  var id = normId_(u.userId);
  return {
    userId: id, displayName: str_(u.displayName) || id, role: roleOf_(u.role),
    siteScope: scopeList_(u.siteScope), mustChange: bool_(u.mustChange), tokenHash: str_(tokenHash)
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

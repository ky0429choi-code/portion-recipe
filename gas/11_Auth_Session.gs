/**
 * 세션 토큰: 96자 hex 난수. 화면에는 토큰 원문을, 시트에는 SHA-256 해시만 저장한다.
 * SESSIONS 탭이 유출되어도 토큰을 다시 쓸 수 없다.
 */
var TOKEN_RE = /^[0-9a-f]{96}$/;

function newToken_() { return hex_(randomBytes_()) + hex_(randomBytes_()).slice(0, 32); }

function createSession_(db, userId) {
  var token = newToken_(), now = Date.now();
  var expires = new Date(now + AUTH.SESSION_TTL_MIN * 60000);
  appendMapped_(db, DB_TAB.sessions, {
    tokenHash: sha256Hex_(token), userId: normId_(userId),
    createdAt: new Date(now), expiresAt: expires, active: 'TRUE'
  });
  return { token: token, expiresAt: expires.toISOString() };
}

function findSession_(db, token) {
  token = str_(token);
  if (!TOKEN_RE.test(token)) return null;
  var h = sha256Hex_(token), found = null;
  var rows = readRows_(db, DB_TAB.sessions, 0);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (safeEqual_(str_(rows[i].tokenHash), h)) { found = rows[i]; break; }
  }
  return found;
}

/** 특정 토큰(해시) 또는 사용자 전체 세션을 비활성화한다. exceptHash는 유지. */
function revokeSessions_(db, opt) {
  var t = readTable_(db, DB_TAB.sessions, 0), n = 0;
  t.rows.forEach(function (r) {
    if (!bool_(r.active)) return;
    var hit = (opt.tokenHash && str_(r.tokenHash) === opt.tokenHash) ||
      (opt.userId && normId_(r.userId) === normId_(opt.userId) && str_(r.tokenHash) !== str_(opt.exceptHash)) ||
      opt.all === true;
    if (hit) { updateRow_(t, r, { active: 'FALSE' }); n++; }
  });
  return n;
}

/** 만료 1일 경과 또는 비활성 세션 행을 지운다(아래에서 위로). 로그인 때 실행. */
function purgeSessions_(db) {
  var t = readTable_(db, DB_TAB.sessions, 0), cutoff = Date.now() - 86400000;
  var targets = t.rows.filter(function (r) { return !bool_(r.active) || toMs_(r.expiresAt) < cutoff; })
    .map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
  targets.forEach(function (row) { t.sheet.deleteRow(row); });
  return targets.length;
}

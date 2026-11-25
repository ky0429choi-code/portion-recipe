/* GAS 게이트 API 시험 (합성 데이터). 실행: node tests/test-gas.js */
const assert = require('assert'), crypto = require('crypto');
const { createGasEnv, syntheticTabs, seedUser } = require('./gas-sim');

const results = [];
function test(name, fn) {
  try { fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
}
function freshEnv() {
  const env = createGasEnv({ tabs: syntheticTabs(), props: { SHEET_ID: 'SYNTHETIC', ADMIN_USER_ID: 'syn.admin' } });
  env.run('setupV3');
  return env;
}
const PW = { admin: 'SynAdmin-2026x', site: 'SynSiteA-2026y' };
function login(env, userId, password) { return env.api('login', { userId, password }); }
const userRow = (env, id) => { const t = env.tabs.USERS, h = t[0]; const r = t.find((x, i) => i && x[h.indexOf('userId')] === id); return Object.fromEntries(h.map((k, i) => [k, r[i]])); };
const setUserCell = (env, id, key, value) => { const t = env.tabs.USERS, h = t[0]; t.find((x, i) => i && x[h.indexOf('userId')] === id)[h.indexOf(key)] = value; };

test('PBKDF2 구현이 Node crypto.pbkdf2Sync와 일치', () => {
  const env = freshEnv();
  const stored = env.run('hashPassword_', 'Check-Value-123');
  const [, iter, salt, hash] = stored.split('$');
  const expect = crypto.pbkdf2Sync('Check-Value-123', Buffer.from(salt, 'hex'), Number(iter), 32, 'sha256').toString('hex');
  assert.strictEqual(hash, expect);
  assert.strictEqual(env.run('verifyPassword_', 'Check-Value-123', stored), true);
  assert.strictEqual(env.run('verifyPassword_', 'check-value-123', stored), false);
  assert.notStrictEqual(env.run('hashPassword_', 'Check-Value-123'), stored, '같은 비밀번호라도 솔트가 달라야 함');
});

test('setupV3: USERS·SESSIONS·AUTH_MODE 생성, 기존 탭 불변, 재실행 안전', () => {
  const env = createGasEnv({ tabs: syntheticTabs(), props: { SHEET_ID: 'S', ADMIN_USER_ID: 'syn.admin' } });
  const before = JSON.stringify(env.tabs.PORTIONS) + JSON.stringify(env.tabs.RECIPES);
  env.run('setupV3'); env.run('setupV3');
  assert.ok(env.tabs.USERS && env.tabs.SESSIONS);
  assert.strictEqual(env.tabs.CONFIG.filter((r) => r[0] === 'AUTH_MODE').length, 1);
  assert.strictEqual(env.tabs.USERS.length, 2, '관리자 1행만');
  assert.strictEqual(userRow(env, 'syn.admin').status, 'PENDING');
  assert.strictEqual(JSON.stringify(env.tabs.PORTIONS) + JSON.stringify(env.tabs.RECIPES), before);
});

test('임시 비밀번호 발급 → 로그인 → 변경 전 데이터 차단 → 변경 후 조회', () => {
  const env = freshEnv();
  assert.strictEqual(env.run('issueTempPasswords'), 1);
  const line = env.logs.find((l) => l.includes('[임시 비밀번호] syn.admin'));
  const temp = line.split(' : ')[1].split(' ')[0];
  assert.strictEqual(temp.length, 12);
  assert.ok(!JSON.stringify(env.tabs.USERS).includes(temp), '시트에 임시 비밀번호 원문 없음');
  const r = login(env, 'SYN.ADMIN ', temp);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.data.user.mustChange, true);
  const tok = r.data.token;
  assert.strictEqual(env.api('bootstrap', {}, tok).code, 'PASSWORD_CHANGE_REQUIRED');
  assert.strictEqual(env.api('changePassword', { currentPassword: temp, newPassword: 'abc' }, tok).code, 'WEAK_PASSWORD');
  assert.strictEqual(env.api('changePassword', { currentPassword: temp, newPassword: 'syn.admin-2026X' }, tok).code, 'WEAK_PASSWORD');
  assert.strictEqual(env.api('changePassword', { currentPassword: 'wrong', newPassword: PW.admin }, tok).code, 'WRONG_PASSWORD');
  const c = env.api('changePassword', { currentPassword: temp, newPassword: PW.admin }, tok);
  assert.strictEqual(c.ok, true, JSON.stringify(c));
  const b = env.api('bootstrap', {}, tok);
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.data.menus.length, 3, '관리자(*)는 전체 메뉴');
  assert.strictEqual(login(env, 'syn.admin', temp).code, 'LOGIN_FAILED', '임시 비밀번호는 더 이상 사용 불가');
});

test('비밀번호 규칙: 4자 이상 숫자만 허용, 3자·공백 거부, 변경 후 새 비밀번호로 로그인', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.pin', password: PW.site });
  const tok = login(env, 'syn.pin', PW.site).data.token;
  assert.strictEqual(env.api('changePassword', { currentPassword: PW.site, newPassword: '123' }, tok).code, 'WEAK_PASSWORD');
  assert.strictEqual(env.api('changePassword', { currentPassword: PW.site, newPassword: '12 34' }, tok).code, 'WEAK_PASSWORD');
  assert.strictEqual(env.api('changePassword', { currentPassword: PW.site, newPassword: '4821' }, tok).ok, true);
  assert.strictEqual(login(env, 'syn.pin', PW.site).code, 'LOGIN_FAILED');
  assert.strictEqual(login(env, 'syn.pin', '4821').ok, true);
});

test('토큰 없음·위조·형식 오류 → AUTH_REQUIRED', () => {
  const env = freshEnv();
  assert.strictEqual(env.api('bootstrap', {}).code, 'AUTH_REQUIRED');
  assert.strictEqual(env.api('bootstrap', {}, 'f'.repeat(96)).code, 'AUTH_REQUIRED');
  assert.strictEqual(env.api('bootstrap', {}, "' OR 1=1").code, 'AUTH_REQUIRED');
});

test('세션 시트에는 토큰 해시만 저장, 응답에 해시·비밀번호 노출 없음', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site, siteScope: 'SITE-A' });
  const r = login(env, 'syn.site', PW.site); const tok = r.data.token;
  assert.ok(!JSON.stringify(env.tabs.SESSIONS).includes(tok));
  assert.ok(JSON.stringify(env.tabs.SESSIONS).includes(crypto.createHash('sha256').update(tok).digest('hex')));
  const all = JSON.stringify([r, env.api('session', {}, tok), env.api('bootstrap', {}, tok)]);
  assert.ok(!/passwordHash|tokenHash|pbkdf2\$/.test(all));
});

test('사업장 범위: SITE-A 계정은 SITE-A 메뉴만, 범위 밖 의견 등록 차단', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site, siteScope: 'SITE-A' });
  const tok = login(env, 'syn.site', PW.site).data.token;
  const b = env.api('bootstrap', {}, tok).data;
  assert.deepStrictEqual(b.menus.map((m) => m.id), ['SYN-A1']);
  assert.strictEqual(env.api('suggestion', { menuId: 'SYN-B1', message: '범위 밖 의견 시도' }, tok).code, 'NOT_FOUND');
  const ok = env.api('suggestion', { menuId: 'SYN-A1', message: '범위 내 의견 등록' }, tok);
  assert.strictEqual(ok.ok, true);
  const fb = env.tabs.FEEDBACK[1]; assert.strictEqual(fb[2], 'SITE-A');
  assert.ok(env.tabs.AUDIT_LOG.some((r) => r[2] === 'syn.site' && r[3] === 'FEEDBACK_CREATE'));
});

test('범위가 비어 있으면 아무 메뉴도 보지 못함(fail-closed)', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.none', password: PW.site, siteScope: '' });
  const tok = login(env, 'syn.none', PW.site).data.token;
  assert.strictEqual(env.api('bootstrap', {}, tok).data.menus.length, 0);
});

test('5회 실패 → 잠금(정답도 거부) → 잠금 해제 후 로그인', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site });
  for (let i = 0; i < 4; i++) assert.strictEqual(login(env, 'syn.site', 'Wrong-pass-1').code, 'LOGIN_FAILED');
  assert.strictEqual(login(env, 'syn.site', 'Wrong-pass-1').code, 'LOGIN_LOCKED');
  assert.strictEqual(login(env, 'syn.site', PW.site).code, 'LOGIN_LOCKED');
  setUserCell(env, 'syn.site', 'lockedUntil', new Date(Date.now() - 1000));
  assert.strictEqual(login(env, 'syn.site', PW.site).ok, true);
  assert.strictEqual(userRow(env, 'syn.site').failCount, 0);
});

test('없는 아이디와 틀린 비밀번호는 같은 메시지', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site });
  const a = login(env, 'nobody', 'Whatever-123'), b = login(env, 'syn.site', 'Whatever-123');
  assert.strictEqual(a.code, b.code); assert.strictEqual(a.message, b.message);
});

test('DISABLED 전환 시 기존 세션 즉시 차단', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site });
  const tok = login(env, 'syn.site', PW.site).data.token;
  assert.strictEqual(env.api('bootstrap', {}, tok).ok, true);
  setUserCell(env, 'syn.site', 'status', 'DISABLED');
  assert.strictEqual(env.api('bootstrap', {}, tok).code, 'AUTH_REQUIRED');
  assert.strictEqual(login(env, 'syn.site', PW.site).code, 'LOGIN_FAILED');
});

test('세션 만료·로그아웃 후 토큰 무효', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site });
  const t1 = login(env, 'syn.site', PW.site).data.token;
  assert.strictEqual(env.api('logout', {}, t1).ok, true);
  assert.strictEqual(env.api('bootstrap', {}, t1).code, 'SESSION_EXPIRED');
  const t2 = login(env, 'syn.site', PW.site).data.token;
  const s = env.tabs.SESSIONS, h = s[0];
  s[s.length - 1][h.indexOf('expiresAt')] = new Date(Date.now() - 1000);
  assert.strictEqual(env.api('bootstrap', {}, t2).code, 'SESSION_EXPIRED');
});

test('임시 비밀번호 72시간 경과 시 로그인 거부', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site, mustChange: true });
  setUserCell(env, 'syn.site', 'passwordSetAt', new Date(Date.now() - 73 * 3600000));
  assert.strictEqual(login(env, 'syn.site', PW.site).code, 'TEMP_EXPIRED');
});

test('AUTH_MODE 없으면 로그인·조회 모두 차단(fail-closed)', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site });
  env.tabs.CONFIG.splice(env.tabs.CONFIG.findIndex((r) => r[0] === 'AUTH_MODE'), 1);
  assert.strictEqual(login(env, 'syn.site', PW.site).code, 'CONFIG_ERROR');
});

test('잘못된 요청·미지원 동작·관리자 함수 원격 호출 차단, 내부 오류 비노출', () => {
  const env = freshEnv();
  assert.strictEqual(env.raw('not json').code, 'BAD_REQUEST');
  assert.strictEqual(env.raw('[1,2]').code, 'BAD_REQUEST');
  assert.strictEqual(env.raw('x'.repeat(20001)).code, 'BAD_REQUEST');
  ['issueTempPasswords', 'setupV3', 'revokeAllSessions', 'hashPassword_', '__proto__', 'constructor', 'toString']
    .forEach((a) => assert.strictEqual(env.api(a, {}).code, 'UNKNOWN_ACTION', a));
  const health = env.api('health'); assert.strictEqual(health.ok, true);
  assert.ok(!JSON.stringify(health).includes('SYNTHETIC'));
  const env2 = createGasEnv({ tabs: syntheticTabs(), props: {} }); // SHEET_ID 없음
  const r = env2.api('login', { userId: 'a', password: 'b' });
  assert.strictEqual(r.code, 'CONFIG_ERROR');
});

test('v2 데이터 원칙 유지: ratioPct 원문, 기준 인분 없음 표시, 확정 연결만', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site });
  const d = env.api('bootstrap', {}, login(env, 'syn.site', PW.site).data.token).data;
  const a1 = d.menus.find((m) => m.id === 'SYN-A1'), b1 = d.menus.find((m) => m.id === 'SYN-B1');
  assert.strictEqual(a1.ratioPct, 125); assert.strictEqual(a1.recipe.id, 'SYN-R1');
  assert.strictEqual(b1.recipe, null); assert.strictEqual(b1.actualG, null);
  const r2 = d.recipes.find((r) => r.id === 'SYN-R2'); assert.strictEqual(r2.baseServings, null); assert.strictEqual(r2.needsBaseServings, true);
});

test('수식 주입 방지: = 로 시작하는 의견은 텍스트로 저장', () => {
  const env = freshEnv(); seedUser(env, { userId: 'syn.site', password: PW.site });
  const tok = login(env, 'syn.site', PW.site).data.token;
  const sheet = env.ctx.SpreadsheetApp.openById('x').getSheetByName('FEEDBACK'), orig = sheet.appendRow, sent = [];
  sheet.appendRow = (row) => { sent.push(row); orig(row); };
  env.api('suggestion', { menuId: 'SYN-A1', message: '=IMPORTXML("http://x")' }, tok);
  assert.ok(sent[0].includes('\'=IMPORTXML("http://x")'), '시트로 보낼 때 앞에 \' 를 붙여 수식 실행 방지');
});

// ---------- 관리자 화면 API ----------
function adminEnv() {
  const env = freshEnv(); env.tabs.USERS.splice(1);
  seedUser(env, { userId: 'boss', password: 'Boss-1234', role: 'ADMIN', siteScope: '*' });
  seedUser(env, { userId: 'staff', password: 'Staff-1234', role: 'USER', siteScope: 'SITE-A' });
  return { env, admin: login(env, 'boss', 'Boss-1234').data.token, user: login(env, 'staff', 'Staff-1234').data.token };
}

test('관리자 API: 일반 사용자·비로그인은 모두 거부', () => {
  const { env, user } = adminEnv();
  ['adminListUsers', 'adminCreateUser', 'adminUpdateUser', 'adminResetPassword', 'adminSetStatus', 'adminUnlock'].forEach((a) => {
    assert.strictEqual(env.api(a, { userId: 'boss', password: 'Hack-1234', status: 'DISABLED', role: 'USER' }, user).code, 'FORBIDDEN', a);
    assert.strictEqual(env.api(a, {}).code, 'AUTH_REQUIRED', a);
  });
  assert.strictEqual(userRow(env, 'boss').status, 'ACTIVE');
});

test('관리자 API: 목록에 해시·토큰 없음', () => {
  const { env, admin } = adminEnv();
  const r = env.api('adminListUsers', {}, admin);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.data.users.length, 2);
  assert.ok(!/pbkdf2\$|passwordHash|tokenHash/.test(JSON.stringify(r)));
});

test('관리자 API: 계정 생성 → 그 비밀번호로 로그인 → 변경 요구', () => {
  const { env, admin } = adminEnv();
  assert.strictEqual(env.api('adminCreateUser', { userId: 'Bad Id!', password: '1234' }, admin).code, 'INVALID_INPUT');
  assert.strictEqual(env.api('adminCreateUser', { userId: 'staff', password: '1234' }, admin).code, 'DUPLICATE');
  assert.strictEqual(env.api('adminCreateUser', { userId: 'new.one', password: '12' }, admin).code, 'WEAK_PASSWORD');
  assert.strictEqual(env.api('adminCreateUser', { userId: 'new.one', password: '5678', siteScope: 'SITE A' }, admin).code, 'INVALID_INPUT');
  const c = env.api('adminCreateUser', { userId: 'New.One', displayName: '새 직원', role: 'USER', siteScope: 'SITE-B', password: '5678', mustChange: true }, admin);
  assert.strictEqual(c.ok, true, JSON.stringify(c)); assert.strictEqual(c.data.user.userId, 'new.one');
  assert.ok(!JSON.stringify(env.tabs.USERS).includes('"5678"'), '시트에 원문 없음');
  const l = login(env, 'new.one', '5678'); assert.strictEqual(l.ok, true); assert.strictEqual(l.data.user.mustChange, true);
  assert.strictEqual(env.api('bootstrap', {}, l.data.token).code, 'PASSWORD_CHANGE_REQUIRED');
  assert.ok(env.tabs.AUDIT_LOG.some((r) => r[2] === 'boss' && r[3] === 'ADMIN_USER_CREATE'));
});

test('관리자 API: 비밀번호 지정 시 대상의 기존 로그인 끊김, 새 비밀번호로만 로그인', () => {
  const { env, admin, user } = adminEnv();
  assert.strictEqual(env.api('bootstrap', {}, user).ok, true);
  assert.strictEqual(env.api('adminResetPassword', { userId: 'staff', password: '9090', mustChange: false }, admin).ok, true);
  assert.strictEqual(env.api('bootstrap', {}, user).code, 'SESSION_EXPIRED');
  assert.strictEqual(login(env, 'staff', 'Staff-1234').code, 'LOGIN_FAILED');
  const l = login(env, 'staff', '9090'); assert.strictEqual(l.ok, true); assert.strictEqual(l.data.user.mustChange, false);
});

test('관리자 API: 정지·재개, 자기 정지 불가, 마지막 관리자 보호', () => {
  const { env, admin, user } = adminEnv();
  assert.strictEqual(env.api('adminSetStatus', { userId: 'staff', status: 'DISABLED' }, admin).ok, true);
  assert.strictEqual(env.api('bootstrap', {}, user).code, 'SESSION_EXPIRED');
  assert.strictEqual(env.api('adminSetStatus', { userId: 'staff', status: 'ACTIVE' }, admin).ok, true);
  assert.strictEqual(login(env, 'staff', 'Staff-1234').ok, true);
  assert.strictEqual(env.api('adminSetStatus', { userId: 'boss', status: 'DISABLED' }, admin).code, 'SELF_DISABLE');
  assert.strictEqual(env.api('adminUpdateUser', { userId: 'boss', role: 'USER' }, admin).code, 'LAST_ADMIN');
  assert.strictEqual(env.api('adminUpdateUser', { userId: 'staff', role: 'ADMIN', siteScope: 'SITE-A,SITE-B', displayName: '현장 관리자' }, admin).ok, true);
  assert.strictEqual(env.api('adminUpdateUser', { userId: 'boss', role: 'USER' }, admin).ok, true, '다른 관리자가 있으면 해제 가능');
  assert.strictEqual(userRow(env, 'staff').siteScope, 'SITE-A,SITE-B');
});

test('관리자 API: 잠금 해제', () => {
  const { env, admin } = adminEnv();
  for (let i = 0; i < 5; i++) login(env, 'staff', 'nope-0000');
  assert.strictEqual(login(env, 'staff', 'Staff-1234').code, 'LOGIN_LOCKED');
  assert.strictEqual(env.api('adminListUsers', {}, admin).data.users.find((u) => u.userId === 'staff').locked, true);
  assert.strictEqual(env.api('adminUnlock', { userId: 'staff' }, admin).ok, true);
  assert.strictEqual(login(env, 'staff', 'Staff-1234').ok, true);
});

test('recoverAdmin: 계정 1개면 그 계정을 관리자·사용으로 복구하고 임시 비밀번호 발급', () => {
  const env = freshEnv(); env.tabs.USERS.splice(1);
  seedUser(env, { userId: 'ky.test', password: 'Old-1234', role: 'user', status: 'PENDING' });
  assert.strictEqual(env.run('recoverAdmin'), 'ky.test');
  const line = env.logs.find((l) => l.startsWith('[관리자 복구]'));
  const temp = line.split('임시 비밀번호: ')[1].split(' ')[0];
  const row = userRow(env, 'ky.test');
  assert.strictEqual(row.role, 'ADMIN'); assert.strictEqual(row.status, 'ACTIVE');
  assert.strictEqual(login(env, 'ky.test', 'Old-1234').code, 'LOGIN_FAILED');
  const l = login(env, 'ky.test', temp); assert.strictEqual(l.ok, true); assert.strictEqual(l.data.user.role, 'ADMIN');
  // 계정이 여러 개이고 ADMIN_USER_ID가 없으면 아무것도 바꾸지 않음
  seedUser(env, { userId: 'other', password: 'Other-1234' });
  const before = JSON.stringify(env.tabs.USERS);
  assert.strictEqual(env.run('recoverAdmin'), null);
  assert.strictEqual(JSON.stringify(env.tabs.USERS), before);
});

let fail = 0;
for (const [s, n, m] of results) { console.log(`${s}  ${n}${m ? '  → ' + m : ''}`); if (s === 'FAIL') fail++; }
console.log(`\nGAS 시험: ${results.length - fail} PASS / ${fail} FAIL`);
process.exitCode = fail ? 1 : 0;

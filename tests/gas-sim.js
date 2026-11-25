/**
 * GAS 실행 환경 모의(합성 데이터 전용). gas/*.gs 를 그대로 불러와 실행한다.
 * Google Sheets 동작 중 테스트에 중요한 것을 흉내 낸다:
 *  - 앞의 ' 는 저장 시 사라짐(텍스트 고정 표시), 'TRUE'/'FALSE' 문자열은 불리언으로 바뀜, Date는 Date로 유지
 */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');

const GAS_DIR = path.join(__dirname, '..', 'gas');
const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const toBuf = (x) => (typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(Array.from(x, (b) => b & 255)));

function sheetValue(v) {
  if (typeof v === 'string') {
    if (v.startsWith("'")) return v.slice(1);
    if (v.toUpperCase() === 'TRUE') return true;
    if (v.toUpperCase() === 'FALSE') return false;
  }
  return v === undefined || v === null ? '' : v;
}

function makeSheet(name, grid) {
  const width = () => Math.max(0, ...grid.map((r) => r.length));
  const pad = (row) => { while (row.length < width()) row.push(''); return row; };
  return {
    getName: () => name,
    getDataRange: () => ({ getValues: () => { makeSheet.reads++; return grid.map((r) => pad(r.slice())); } }),
    getLastColumn: () => width(),
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => pad((grid[r - 1 + i] || []).slice()).slice(c - 1, c - 1 + nc)),
      setValues: (vals) => vals.forEach((rowVals, i) => {
        while (grid.length < r + i) grid.push([]);
        const row = grid[r - 1 + i];
        rowVals.forEach((v, j) => { row[c - 1 + j] = sheetValue(v); });
      })
    }),
    appendRow: (row) => grid.push(row.map(sheetValue)),
    deleteRow: (r) => grid.splice(r - 1, 1),
    setFrozenRows: () => {},
    _grid: grid
  };
}

function createGasEnv({ tabs, props = {} }) {
  const sheets = {};
  Object.keys(tabs).forEach((n) => { sheets[n] = makeSheet(n, tabs[n]); });
  const book = {
    getSheetByName: (n) => sheets[n] || null,
    getSheets: () => Object.values(sheets),
    insertSheet: (n) => { tabs[n] = []; sheets[n] = makeSheet(n, tabs[n]); return sheets[n]; }
  };
  const logs = [];
  const store = new Map(); // CacheService 흉내 (TTL은 시험에서 clearCache로 대신)
  const cacheApi = {
    get: (k) => (store.has(k) ? store.get(k) : null),
    put: (k, v) => { store.set(k, String(v)); },
    remove: (k) => { store.delete(k); },
    putAll: (m) => { Object.keys(m).forEach((k) => store.set(k, String(m[k]))); },
    getAll: (keys) => { const o = {}; keys.forEach((k) => { if (store.has(k)) o[k] = store.get(k); }); return o; },
    removeAll: (keys) => { keys.forEach((k) => store.delete(k)); }
  };
  const ctx = {
    CacheService: { getScriptCache: () => cacheApi },
    console: { log: () => {}, error: (m) => logs.push('ERROR ' + m) },
    Logger: { log: (m) => logs.push(String(m)) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    SpreadsheetApp: { openById: (id) => { if (!id) throw new Error('no id'); return book; } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, value) => signed(crypto.createHash('sha256').update(toBuf(value)).digest()),
      computeHmacSha256Signature: (value, key) => signed(crypto.createHmac('sha256', toBuf(key)).update(toBuf(value)).digest()),
      newBlob: (s) => ({ getBytes: () => signed(Buffer.from(String(s), 'utf8')) })
    }
  };
  vm.createContext(ctx);
  fs.readdirSync(GAS_DIR).filter((f) => f.endsWith('.gs')).sort()
    .forEach((f) => vm.runInContext(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), ctx, { filename: f }));

  const run = (fnName, ...args) => { ctx.__args = args; return vm.runInContext(`${fnName}.apply(null, __args)`, ctx); };
  const raw = (body) => JSON.parse(run('doPost', { postData: { contents: body } }).getContent());
  const api = (action, payload, token) => raw(JSON.stringify({ action, payload, token }));
  const clearCache = () => store.clear(); // 캐시 만료(최대 2~5분 후)를 흉내
  const sheetReads = () => makeSheet.reads;
  return { ctx, run, api, raw, tabs, logs, props, clearCache, sheetReads, cacheStore: store };
}

/** 합성 시험 데이터: 사업장 A/B + 지역 미배정 메뉴, 레시피 2종(1종은 기준 인분 없음) */
function syntheticTabs() {
  return {
    CONFIG: [['key', 'value', 'note'], ['DATA_MODE', 'PRIVATE_TEST', ''], ['SCHEMA_VERSION', '2', '']],
    PORTIONS: [
      ['id', 'siteId', 'name', 'guideG', 'actualG', 'commonGuideG', 'ratioPct', 'recipeCode', 'alt', 'visual', 'recipeLinksJson', 'reviewNotes', 'memo'],
      ['SYN-A1', 'SITE-A', '합성 메뉴 A1', 180, 200, 180, 125, 'SYN-R1', '', '', '["SYN-R1"]', '', ''],
      ['SYN-B1', 'SITE-B', '합성 메뉴 B1', 250, '', 240, '', '', '', '', '[]', '확인 필요 메모', ''],
      ['SYN-U1', 'REGION_UNASSIGNED', '합성 메뉴 U1', 90, 95, 90, 105.5, '', '', '', '[]', '', '']
    ],
    RECIPES: [
      ['id', 'ownerSite', 'name', 'kind', 'category', 'cuisines', 'baseServings', 'rawBasis', 'ingredientsJson', 'stepsJson', 'notes', 'issuesJson'],
      ['SYN-R1', '합성 사업장', '합성 레시피 1', 'menu', '메뉴', '한식', 100, '100인', JSON.stringify([{ name: '재료 가', quantity: 12, unit: 'kg' }]), '[]', '', '[]'],
      ['SYN-R2', '합성 사업장', '합성 레시피 2', 'menu', '분류 대기', '한식', '', '', JSON.stringify([{ name: '재료 나', quantity: 3, unit: 'kg' }]), '[]', '', '[]']
    ],
    FEEDBACK: [['id', 'createdAt', 'siteId', 'menuId', 'message', 'status', 'adminNote']],
    AUDIT_LOG: [['id', 'createdAt', 'actor', 'action', 'entityId', 'summary']]
  };
}

/** USERS 탭에 계정을 직접 넣는다(시험·로컬 미리보기 전용). */
function seedUser(env, { userId, password, displayName = userId, role = 'USER', siteScope = '*', mustChange = false, status = 'ACTIVE' }) {
  const t = env.tabs.USERS, h = t[0];
  const rec = {
    userId, displayName, role, siteScope, status,
    passwordHash: password ? env.run('hashPassword_', password) : '',
    mustChange: mustChange ? 'TRUE' : 'FALSE', passwordSetAt: new Date(), failCount: 0, lockedUntil: '', lastLoginAt: '', note: 'seed'
  };
  t.push(h.map((k) => sheetValue(rec[k])));
}

makeSheet.reads = 0;

module.exports = { createGasEnv, syntheticTabs, seedUser };

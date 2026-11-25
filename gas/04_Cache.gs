/**
 * 속도용 서버 캐시(CacheService). 시트 읽기를 줄여 응답을 빠르게 한다.
 *  - 설정(AUTH_MODE) 10분 · 세션 최대 10분 · 계정 2분 · 업무 데이터 5분 · 의견 5분
 *  - 앱(API)으로 바꾼 내용은 즉시 반영(해당 캐시 삭제). 시트를 직접 고친 내용은 위 시간 안에 반영된다.
 *    바로 반영하려면 편집기에서 clearCache() 실행.
 *  - 캐시가 실패해도 시트에서 읽으므로 동작은 같다(느려질 뿐).
 */
var CACHE_TTL = Object.freeze({ CONFIG: 600, SESSION: 600, USER: 120, DATA: 300, FEEDBACK: 300 });
var CACHE_CHUNK = 90000; // CacheService 값 1개 한도(100KB) 미만으로 나눠 저장

function cache_() { return CacheService.getScriptCache(); }

function cacheGetJson_(key) {
  try { var v = cache_().get(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}

function cachePutJson_(key, obj, sec) {
  try {
    var s = JSON.stringify(obj), t = Math.floor(sec);
    if (s.length < CACHE_CHUNK && t >= 1) cache_().put(key, s, Math.min(21600, t));
  } catch (e) { /* 캐시 실패는 무시 */ }
}

function cacheDel_(key) { try { cache_().remove(key); } catch (e) { /* 무시 */ } }

/** 큰 값(메뉴·레시피 전체)은 여러 조각으로 나눠 저장 */
function cachePutBig_(prefix, obj, sec) {
  try {
    var s = JSON.stringify(obj), n = Math.ceil(s.length / CACHE_CHUNK) || 1, map = {};
    if (n > 50) return;
    for (var i = 0; i < n; i++) map[prefix + ':' + i] = s.substr(i * CACHE_CHUNK, CACHE_CHUNK);
    map[prefix + ':n'] = String(n);
    cache_().putAll(map, sec);
  } catch (e) { /* 무시 */ }
}

function cacheGetBig_(prefix) {
  try {
    var n = Number(cache_().get(prefix + ':n'));
    if (!n) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(prefix + ':' + i);
    var got = cache_().getAll(keys), s = '';
    for (var j = 0; j < n; j++) { if (got[keys[j]] === undefined || got[keys[j]] === null) return null; s += got[keys[j]]; }
    return JSON.parse(s);
  } catch (e) { return null; }
}

function cacheDelBig_(prefix) {
  try {
    var n = Number(cache_().get(prefix + ':n')) || 0, keys = [prefix + ':n'];
    for (var i = 0; i < n; i++) keys.push(prefix + ':' + i);
    cache_().removeAll(keys);
  } catch (e) { /* 무시 */ }
}

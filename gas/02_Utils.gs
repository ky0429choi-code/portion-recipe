function str_(v) { return v === null || v === undefined ? '' : String(v); }
function num_(v) { if (v === null || v === undefined || String(v).trim() === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function bool_(v) { return v === true || str_(v).trim().toUpperCase() === 'TRUE'; }
function jsonArr_(v) { try { var x = JSON.parse(str_(v) || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; } }
/** 시트 수식 주입 방지: 문자열이 =,+,@,- 등으로 시작하면 텍스트로 고정한다. */
function safeCell_(v) { if (typeof v !== 'string') return v === undefined || v === null ? '' : v; return /^[=+@\-\t\r]/.test(v) ? "'" + v : v; }
function normId_(v) { return str_(v).trim().toLowerCase(); }

/** 시트 날짜 셀(Date)·문자열·숫자를 모두 ms로 바꾼다. 해석 불가 시 0. */
function toMs_(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var s = str_(v).trim(); if (!s) return 0;
  var t = Date.parse(s); return isFinite(t) ? t : 0;
}

function toArr_(x) { return Array.prototype.slice.call(x); }
function hex_(bytes) {
  return toArr_(bytes).map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
}
function unhex_(h) {
  var out = []; h = str_(h);
  for (var i = 0; i + 1 < h.length; i += 2) { var v = parseInt(h.substr(i, 2), 16); out.push(v > 127 ? v - 256 : v); }
  return out;
}
function utf8_(s) { return toArr_(Utilities.newBlob(str_(s)).getBytes()); }
function sha256Hex_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str_(s), Utilities.Charset.UTF_8)); }
/** Utilities.getUuid()는 보안 난수 기반이다. 두 개를 섞어 32바이트 난수를 만든다. */
function randomBytes_() {
  return toArr_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Date.now(), Utilities.Charset.UTF_8));
}
/** 길이 노출 외에는 비교 시간이 일정한 문자열 비교. */
function safeEqual_(a, b) {
  a = str_(a); b = str_(b); if (a.length !== b.length) return false;
  var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function apiError_(code, message) { var e = new Error(message); e.code = code; return e; }

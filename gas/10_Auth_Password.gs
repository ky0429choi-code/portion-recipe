/**
 * 비밀번호 저장: PBKDF2-HMAC-SHA256 (사용자별 16바이트 솔트, 32바이트 결과).
 * 저장 형식: pbkdf2$<반복횟수>$<솔트hex>$<해시hex>
 * 시트를 열람해도 비밀번호 원문을 알 수 없다. 반복 횟수가 함께 저장되므로 나중에 올려도 기존 계정이 동작한다.
 */
function pbkdf2_(pwBytes, saltBytes, iter) {
  var u = toArr_(Utilities.computeHmacSha256Signature(saltBytes.concat([0, 0, 0, 1]), pwBytes));
  var out = u.slice();
  for (var i = 1; i < iter; i++) {
    u = toArr_(Utilities.computeHmacSha256Signature(u, pwBytes));
    for (var j = 0; j < out.length; j++) out[j] ^= u[j];
  }
  return out;
}

function pbkdf2Iter_() {
  var v = num_(PropertiesService.getScriptProperties().getProperty('PBKDF2_ITER'));
  return v && v >= 1000 && v <= 200000 ? Math.floor(v) : AUTH.PBKDF2_ITER;
}

function hashPassword_(pw) {
  var iter = pbkdf2Iter_();
  var salt = randomBytes_().slice(0, 16);
  return 'pbkdf2$' + iter + '$' + hex_(salt) + '$' + hex_(pbkdf2_(utf8_(pw), salt, iter));
}

function verifyPassword_(pw, stored) {
  var parts = str_(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  var iter = Number(parts[1]);
  if (!(iter >= 1000 && iter <= 200000) || !/^[0-9a-f]{32}$/.test(parts[2]) || !/^[0-9a-f]{64}$/.test(parts[3])) return false;
  return safeEqual_(hex_(pbkdf2_(utf8_(pw), unhex_(parts[2]), iter)), parts[3]);
}

function checkPasswordPolicy_(pw, userId) {
  pw = str_(pw);
  if (pw.length < AUTH.MIN_PW_LEN || pw.length > 128)
    throw apiError_('WEAK_PASSWORD', '비밀번호는 ' + AUTH.MIN_PW_LEN + '~128자로 입력하세요.');
  if (/\s/.test(pw)) throw apiError_('WEAK_PASSWORD', '비밀번호에 공백을 넣을 수 없습니다.');
  if (userId && pw.toLowerCase().indexOf(normId_(userId)) >= 0)
    throw apiError_('WEAK_PASSWORD', '비밀번호에 아이디를 포함할 수 없습니다.');
}

/** 헷갈리는 글자(0,O,1,l,I)를 뺀 12자 임시 비밀번호. 편향 없이 뽑는다. */
function tempPassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // 56자
  var out = '';
  while (out.length < 12) {
    var bytes = randomBytes_();
    for (var i = 0; i < bytes.length && out.length < 12; i++) {
      var b = bytes[i] & 255;
      if (b < 224) out += chars.charAt(b % 56);
    }
  }
  // 정책(영문+숫자) 보장
  if (!/[0-9]/.test(out)) out = out.slice(0, 11) + '7';
  if (!/[A-Za-z]/.test(out)) out = 'K' + out.slice(1);
  return out;
}

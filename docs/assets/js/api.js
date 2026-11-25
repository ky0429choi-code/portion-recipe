/**
 * GAS 게이트 호출. 모든 요청은 POST + text/plain(사전요청 없음), 토큰은 본문에만 싣는다.
 * 토큰은 sessionStorage에 둔다: 탭/브라우저를 닫으면 사라지고, 서버에서도 8시간 후 만료된다.
 */
import { CONFIG } from './config.js';

const TOKEN_KEY = 'portion_guide_token';
const AUTH_CODES = new Set(['AUTH_REQUIRED', 'SESSION_EXPIRED']);
let onAuthLost = () => {};

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const getToken = () => sessionStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);
export const setAuthLostHandler = (fn) => { onAuthLost = fn; };

export async function call(action, payload = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: getToken(), payload }),
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: ctrl.signal
    });
  } catch (e) {
    throw new ApiError('NETWORK', e.name === 'AbortError' ? '서버 응답이 늦습니다. 잠시 후 다시 시도해 주세요.' : '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.');
  } finally { clearTimeout(timer); }

  if (!res.ok) throw new ApiError('NETWORK', `서버 응답 오류 (${res.status})`);
  let body;
  try { body = await res.json(); } catch { throw new ApiError('NETWORK', '서버 응답을 읽을 수 없습니다.'); }
  if (!body || body.ok !== true) {
    const err = new ApiError(body?.code || 'UNKNOWN', body?.message || '요청을 처리하지 못했습니다.');
    if (AUTH_CODES.has(err.code)) { clearToken(); onAuthLost(err); }
    throw err;
  }
  return body.data;
}

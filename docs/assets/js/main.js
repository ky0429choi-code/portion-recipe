/** 시작 흐름: (설정 없음 → 시연) / (토큰 없음 → 로그인) / (임시 비밀번호 → 변경) / (정상 → 데이터 로드) */
import { CONFIG } from './config.js';
import { state, applyData, clearData } from './state.js';
import { $, $$, flash } from './util.js';
import * as api from './api.js';
import { render, bindNav, setRenderHandlers } from './render.js';
import { resetAdmin } from './admin.js';
import { DEMO_DATA } from './demo-data.js';

const VIEWS = ['login-view', 'pw-view', 'app-view'];
function show(view) { VIEWS.forEach((id) => { $('#' + id).hidden = id !== view; }); }

function setBanner(text, demo = false) { const b = $('#banner'); b.textContent = text; b.classList.toggle('demo', demo); }

/** 관리자에게만 [계정 관리] 탭 표시 (실제 권한 검사는 서버가 함) */
function applyRoleUi(user) {
  const isAdmin = Boolean(user && user.role === 'ADMIN');
  $$('.admin-only').forEach((el) => { el.hidden = !isAdmin; });
  $('#bottom-nav').classList.toggle('four', isAdmin);
  if (!isAdmin && state.tab === 'admin') state.tab = 'portion';
}

function showLogin(message = '') {
  clearData();
  resetAdmin();
  state.tab = 'portion';
  applyRoleUi(null);
  $('#main').innerHTML = '';
  $('#login-pw').value = '';
  $('#login-error').textContent = message;
  show('login-view');
  $('#login-id').focus();
}

/** voluntary=true: 로그인한 사용자가 [비밀번호 변경]을 누른 경우(취소 가능) */
function showPasswordChange(message = '', voluntary = false) {
  ['#pw-current', '#pw-new', '#pw-new2'].forEach((s) => { $(s).value = ''; });
  $('#pw-error').textContent = message;
  $('#pw-cancel').hidden = !voluntary;
  $('#pw-desc').textContent = voluntary
    ? '현재 비밀번호를 확인한 뒤 새 비밀번호로 바꿉니다. 다른 기기의 로그인은 끊깁니다.'
    : '처음 로그인했거나 관리자가 비밀번호를 지정한 경우, 새 비밀번호를 정해야 이용할 수 있습니다.';
  $('#pw-current-label').textContent = voluntary ? '현재 비밀번호' : '현재(임시) 비밀번호';
  $('#pw-submit').textContent = voluntary ? '변경하기' : '변경하고 시작하기';
  show('pw-view');
  $('#pw-current').focus();
}

async function enterApp(user) {
  state.user = user;
  if (user.mustChange) { showPasswordChange(); return; }
  $('#user-name').textContent = `${user.displayName} · ${user.role === 'ADMIN' ? '관리자' : '사용자'}`;
  applyRoleUi(user);
  show('app-view');
  await loadData();
}

async function loadData() {
  setBanner('Google Sheets에서 권한 범위 자료를 불러오는 중…');
  $('#main').innerHTML = '<div class="loading">데이터를 불러오는 중입니다.</div>';
  try {
    const data = await api.call('bootstrap');
    applyData(data);
    setBanner(`계정 로그인 · 권한 범위 자료 | 메뉴 ${state.menus.length}종 · 레시피 ${state.recipes.length}종`);
    render();
  } catch (e) {
    if (e.code === 'PASSWORD_CHANGE_REQUIRED') { showPasswordChange(e.message); return; }
    if (e.code === 'AUTH_REQUIRED' || e.code === 'SESSION_EXPIRED') return; // onAuthLost에서 처리
    setBanner(`연결 실패: ${e.message}`);
    $('#main').innerHTML = '<div class="loading">자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>';
  }
}

async function submitSuggestion(menuId, message) {
  if (state.mode === 'DEMO') { flash('시연 모드에서는 저장하지 않습니다.'); return; }
  try {
    await api.call('suggestion', { menuId, message });
    flash('의견을 저장했어요.');
    await loadData();
  } catch (e) {
    if (e.code !== 'AUTH_REQUIRED' && e.code !== 'SESSION_EXPIRED') flash(`저장 실패: ${e.message}`);
  }
}

function bindAuthForms() {
  $('#login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#login-submit'), userId = $('#login-id').value.trim(), password = $('#login-pw').value;
    if (!userId || !password) { $('#login-error').textContent = '아이디와 비밀번호를 입력하세요.'; return; }
    btn.disabled = true; btn.textContent = '확인 중…'; $('#login-error').textContent = '';
    try {
      const res = await api.call('login', { userId, password });
      api.setToken(res.token);
      $('#login-pw').value = '';
      await enterApp(res.user);
    } catch (e) {
      $('#login-pw').value = '';
      $('#login-error').textContent = e.message;
    } finally { btn.disabled = false; btn.textContent = '로그인'; }
  });

  $('#pw-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cur = $('#pw-current').value, next = $('#pw-new').value, next2 = $('#pw-new2').value, btn = $('#pw-submit');
    if (!cur || !next) { $('#pw-error').textContent = '비밀번호를 입력하세요.'; return; }
    if (next !== next2) { $('#pw-error').textContent = '새 비밀번호가 서로 다릅니다.'; return; }
    btn.disabled = true; btn.textContent = '변경 중…'; $('#pw-error').textContent = '';
    try {
      const res = await api.call('changePassword', { currentPassword: cur, newPassword: next });
      flash('비밀번호를 변경했어요.');
      await enterApp(res.user);
    } catch (e) {
      $('#pw-error').textContent = e.message;
    } finally { btn.disabled = false; btn.textContent = '변경하고 시작하기'; }
  });

  const logout = async () => {
    try { await api.call('logout'); } catch { /* 서버 실패와 관계없이 화면은 로그아웃 */ }
    api.clearToken();
    showLogin('로그아웃했습니다.');
  };
  $('#logout').addEventListener('click', logout);
  $('#pw-logout').addEventListener('click', logout);
  $('#change-pw').addEventListener('click', () => showPasswordChange('', true));
  $('#pw-cancel').addEventListener('click', () => show('app-view'));
}

async function start() {
  bindNav();
  setRenderHandlers({ onSuggestion: submitSuggestion });

  if (!CONFIG.API_URL) {
    state.mode = 'DEMO';
    applyData(DEMO_DATA);
    $('#user-name').textContent = '시연 모드';
    $('#logout').hidden = true;
    $('#change-pw').hidden = true;
    $('#side-note').textContent = '시연 · 가상 데이터';
    setBanner('시연 모드 · 서버 미연결 · 화면에 보이는 메뉴·레시피는 모두 가상 데이터입니다.', true);
    show('app-view');
    render();
    return;
  }

  bindAuthForms();
  api.setAuthLostHandler((e) => showLogin(e.message));
  if (!api.getToken()) { showLogin(); return; }
  try {
    const res = await api.call('session');
    await enterApp(res.user);
  } catch (e) {
    if (e.code !== 'AUTH_REQUIRED' && e.code !== 'SESSION_EXPIRED') showLogin(e.message);
  }
}

start();

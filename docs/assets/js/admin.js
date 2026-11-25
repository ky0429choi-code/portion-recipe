/**
 * 계정 관리(관리자 전용) — 목록 · 새 계정 · 이름/권한/범위 수정 · 비밀번호 지정 · 정지/사용 · 잠금 해제.
 * 권한 확인은 서버(GAS)가 한다. 이 화면은 버튼을 보여 줄 뿐이다.
 */
import { state } from './state.js';
import { $, $$, esc, flash } from './util.js';
import * as api from './api.js';

const ROLE = { ADMIN: '관리자', USER: '사용자' };
const STATUS = { ACTIVE: '사용', DISABLED: '정지', PENDING: '대기' };
const NEW = '__new__';
let users = [], selected = null, busy = false;

export function resetAdmin() { users = []; selected = null; busy = false; }

export async function renderAdmin(reload = true) {
  const main = $('#main');
  if (reload) {
    main.innerHTML = '<div class="loading">계정 목록을 불러오는 중…</div>';
    try { users = (await api.call('adminListUsers')).users || []; }
    catch (e) { if (state.tab === 'admin') main.innerHTML = `<div class="loading">${esc(e.message)}</div>`; return; }
  }
  if (state.tab !== 'admin') return;
  if (selected && selected !== NEW && !users.some((u) => u.userId === selected)) selected = null;
  main.innerHTML = `<div class="workspace ${selected ? 'detail-open' : ''}">
    <section class="panel listpanel"><div class="listtop"><div class="row"><strong>계정 관리</strong><span class="count">${users.length}명</span></div>
      <button class="primary" id="adm-new" type="button">＋ 새 계정 만들기</button></div>
      <div class="items">${listHTML()}</div></section>
    <article class="panel detailpanel"><div class="detail">${selected === NEW ? createHTML() : detailHTML()}</div></article></div>`;
  bind();
}

function listHTML() {
  return users.map((u) => `<button class="item ${selected === u.userId ? 'selected' : ''}" data-user-id="${esc(u.userId)}" type="button">
    <span><strong>${esc(u.displayName)}</strong><small>${esc(u.userId)} · ${ROLE[u.role] || esc(u.role)} · 범위 ${esc(u.siteScope || '없음')}${u.locked ? ' · 잠김' : ''}${u.mustChange ? ' · 비밀번호 변경 대기' : ''}</small></span>
    <span class="badge st-${esc(u.status.toLowerCase())}">${STATUS[u.status] || esc(u.status)}</span></button>`).join('')
    || '<p class="empty">계정이 없습니다.</p>';
}

const roleOptions = (cur) => Object.keys(ROLE).map((r) => `<option value="${r}" ${r === cur ? 'selected' : ''}>${ROLE[r]}</option>`).join('');
const scopeHint = '<p class="hint">* = 전체 사업장. 여러 곳은 쉼표로 구분(예: SITE-A,SITE-B). 현재 운영 데이터는 사업장 미지정(REGION_UNASSIGNED)이라 * 를 권장합니다.</p>';

function createHTML() {
  return `<button class="back" data-adm-back type="button">← 계정 목록</button><h2>새 계정 만들기</h2>
  <form id="adm-create" class="form-grid" autocomplete="off" novalidate>
    <label>아이디<input name="userId" maxlength="64" autocapitalize="none" spellcheck="false" placeholder="예: hong.gildong" required></label>
    <label>이름<input name="displayName" maxlength="40" placeholder="화면에 보일 이름"></label>
    <label>권한<select name="role">${roleOptions('USER')}</select></label>
    <label>사업장 범위<input name="siteScope" value="*" maxlength="200"></label>
    ${scopeHint}
    <label>초기 비밀번호<input name="password" type="password" autocomplete="new-password" maxlength="128" placeholder="4자 이상" required></label>
    <label class="check"><input name="mustChange" type="checkbox" checked> 첫 로그인 때 본인이 비밀번호를 바꾸도록 요구</label>
    <p class="hint">아이디는 영문 소문자·숫자·. _ - 로 3자 이상. 초기 비밀번호는 본인에게 직접 전달하세요.</p>
    <div class="row end"><button class="primary" type="submit">계정 만들기</button></div>
  </form>`;
}

function detailHTML() {
  const u = users.find((x) => x.userId === selected);
  if (!u) return '<p class="empty">왼쪽에서 계정을 고르거나 새 계정을 만드세요.</p>';
  const me = state.user && state.user.userId === u.userId;
  const last = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ko-KR') : '없음';
  return `<button class="back" data-adm-back type="button">← 계정 목록</button>
  <h2>${esc(u.displayName)}${me ? ' <small>(나)</small>' : ''}</h2>
  <div class="sub">${esc(u.userId)} · 상태 ${STATUS[u.status] || esc(u.status)} · 마지막 로그인 ${esc(last)}${u.locked ? ' · 로그인 실패로 잠김' : ''}</div>

  <section class="section"><h3>기본 정보</h3>
    <form id="adm-edit" class="form-grid" novalidate>
      <label>이름<input name="displayName" maxlength="40" value="${esc(u.displayName)}"></label>
      <label>권한<select name="role">${roleOptions(u.role)}</select></label>
      <label>사업장 범위<input name="siteScope" maxlength="200" value="${esc(u.siteScope)}"></label>
      ${scopeHint}
      <div class="row end"><button class="primary" type="submit">저장</button></div>
    </form></section>

  <section class="section"><h3>비밀번호 지정</h3>
    <form id="adm-pw" class="form-grid" autocomplete="off" novalidate>
      <label>새 비밀번호<input name="password" type="password" autocomplete="new-password" maxlength="128" placeholder="4자 이상" required></label>
      <label class="check"><input name="mustChange" type="checkbox" ${me ? '' : 'checked'}> 다음 로그인 때 본인이 다시 바꾸도록 요구</label>
      <p class="hint">지정하면 이 계정의 다른 로그인은 모두 끊깁니다.</p>
      <div class="row end"><button class="primary" type="submit">비밀번호 지정</button></div>
    </form></section>

  <section class="section"><h3>상태</h3><div class="row wrap">
    ${u.status === 'DISABLED'
      ? '<button class="primary" type="button" data-adm-status="ACTIVE">사용 재개</button>'
      : `<button class="danger" type="button" data-adm-status="DISABLED" ${me ? 'disabled title="자기 계정은 정지할 수 없습니다"' : ''}>계정 정지</button>`}
    ${u.locked ? '<button class="secondary" type="button" data-adm-unlock>잠금 해제</button>' : ''}
  </div><p class="hint">정지하면 로그인 중이어도 다음 요청부터 바로 차단됩니다.</p></section>`;
}

async function run(action, payload, okMsg, keepSelected = selected) {
  if (busy) return;
  busy = true;
  $$('#main button').forEach((b) => { b.disabled = true; });
  try {
    await api.call(action, payload);
    flash(okMsg);
    selected = keepSelected;
    await renderAdmin(true);
  } catch (e) {
    flash(e.message);
    $$('#main button').forEach((b) => { b.disabled = false; });
  } finally { busy = false; }
}

function bind() {
  $('#adm-new').onclick = () => { selected = NEW; renderAdmin(false); };
  $$('[data-user-id]').forEach((b) => { b.onclick = () => { selected = b.dataset.userId; renderAdmin(false); if (innerWidth <= 750) scrollTo(0, 0); }; });
  $$('[data-adm-back]').forEach((b) => { b.onclick = () => { selected = null; renderAdmin(false); }; });

  const create = $('#adm-create');
  if (create) create.onsubmit = (ev) => {
    ev.preventDefault();
    const f = create.elements, userId = f.userId.value.trim().toLowerCase();
    if (!userId || !f.password.value) { flash('아이디와 초기 비밀번호를 입력하세요.'); return; }
    run('adminCreateUser', {
      userId, displayName: f.displayName.value.trim(), role: f.role.value, siteScope: f.siteScope.value.trim(),
      password: f.password.value, mustChange: f.mustChange.checked
    }, `계정 ${userId}을(를) 만들었어요.`, userId);
  };

  const edit = $('#adm-edit');
  if (edit) edit.onsubmit = (ev) => {
    ev.preventDefault();
    const f = edit.elements;
    run('adminUpdateUser', { userId: selected, displayName: f.displayName.value.trim(), role: f.role.value, siteScope: f.siteScope.value.trim() }, '저장했어요.');
  };

  const pw = $('#adm-pw');
  if (pw) pw.onsubmit = (ev) => {
    ev.preventDefault();
    const f = pw.elements;
    if (!f.password.value) { flash('새 비밀번호를 입력하세요.'); return; }
    run('adminResetPassword', { userId: selected, password: f.password.value, mustChange: f.mustChange.checked }, '비밀번호를 지정했어요. 본인에게 직접 전달하세요.');
  };

  $$('[data-adm-status]').forEach((b) => {
    b.onclick = () => {
      const next = b.dataset.admStatus;
      if (next === 'DISABLED' && !confirm(`${selected} 계정을 정지할까요? 로그인 중이어도 바로 차단됩니다.`)) return;
      run('adminSetStatus', { userId: selected, status: next }, next === 'DISABLED' ? '계정을 정지했어요.' : '계정을 다시 사용할 수 있어요.');
    };
  });
  $$('[data-adm-unlock]').forEach((b) => { b.onclick = () => run('adminUnlock', { userId: selected }, '잠금을 풀었어요.'); });
}

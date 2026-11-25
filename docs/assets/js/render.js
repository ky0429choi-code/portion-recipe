/** 화면 그리기와 이벤트 연결 (v2 Client_06_Render, Client_07_Events 이식). */
import { state } from './state.js';
import { $, $$, esc, flash, validServings } from './util.js';
import { filteredMenus, menuRows, recipeRows, menuDetail, recipeDetail, manageView, ingredientLines, menuTotal } from './views.js';

let handlers = { onSuggestion: async () => {} };
export const setRenderHandlers = (h) => { handlers = { ...handlers, ...h }; };

function panel(listTitle, searchId, searchValue, placeholder, rowsHTML, detailHTML, extra) {
  const open = (state.tab === 'portion' && state.selected) || (state.tab === 'recipes' && state.selectedRecipe);
  const count = state.tab === 'recipes' ? state.recipes.length : filteredMenus().length;
  return `<div class="workspace ${open ? 'detail-open' : ''}"><section class="panel listpanel"><div class="listtop"><div class="row"><strong>${listTitle}</strong><span class="count">${count}종</span></div><input class="search" id="${searchId}" placeholder="${placeholder}" value="${esc(searchValue)}">${extra || ''}</div><div class="items" id="items">${rowsHTML}</div></section><article class="panel detailpanel"><div class="detail">${detailHTML}</div></article></div>`;
}

function nav() { $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab)); }

export function render() {
  nav();
  const main = $('#main');
  if (state.tab === 'portion') {
    const filters = `<div class="tabs"><button data-filter="all" class="${state.filter === 'all' ? 'active' : ''}">전체</button><button data-filter="needs" class="${state.filter === 'needs' ? 'active' : ''}">확인 필요</button></div>`;
    main.innerHTML = panel('인당량 검색', 'search', state.search, '메뉴명 또는 Recipe 코드 검색', menuRows(), menuDetail(), filters);
    $('#search').oninput = (e) => { state.search = e.target.value; $('#items').innerHTML = menuRows(); $('.count').textContent = `${filteredMenus().length}종`; bindMenuRows(); };
    $$('[data-filter]').forEach((b) => { b.onclick = () => { state.filter = b.dataset.filter; render(); }; });
    bindMenuRows(); bindDetail();
  } else if (state.tab === 'recipes') {
    main.innerHTML = panel('통합 레시피', 'recipeSearch', state.recipeSearch, '레시피명 또는 사업장 검색', recipeRows(), recipeDetail(), '<div class="sub">레시피 원본 · 메뉴 연결은 확정된 경우만 표시</div>');
    $('#recipeSearch').oninput = (e) => { state.recipeSearch = e.target.value; $('#items').innerHTML = recipeRows(); bindRecipeRows(); };
    bindRecipeRows(); bindDetail();
  } else {
    main.innerHTML = manageView();
    $$('[data-menu-id]').forEach((b) => { b.onclick = () => { state.tab = 'portion'; state.selected = b.dataset.menuId; render(); }; });
  }
}

function bindMenuRows() { $$('[data-menu-id]').forEach((b) => { b.onclick = () => { state.selected = b.dataset.menuId; render(); if (innerWidth <= 750) scrollTo(0, 0); }; }); }
function bindRecipeRows() { $$('[data-recipe-id]').forEach((b) => { b.onclick = () => { state.selectedRecipe = b.dataset.recipeId; render(); if (innerWidth <= 750) scrollTo(0, 0); }; }); }

function bindDetail() {
  $$('[data-back]').forEach((b) => { b.onclick = () => { if (state.tab === 'recipes') state.selectedRecipe = null; else state.selected = null; render(); }; });
  const n = $('#servings');
  if (n) n.oninput = (e) => {
    state.servings = e.target.value === '' ? NaN : Number(e.target.value);
    const m = state.menus.find((x) => x.id === state.selected);
    $('#total').textContent = menuTotal(m);
    if ($('#ingredients') && m.recipe) $('#ingredients').innerHTML = ingredientLines(m.recipe, state.servings);
  };
  const rs = $('#recipeServings');
  if (rs) rs.oninput = (e) => {
    state.servings = e.target.value === '' ? NaN : Number(e.target.value);
    const r = state.recipes.find((x) => x.id === state.selectedRecipe);
    $('#recipeIngredients').innerHTML = ingredientLines(r, state.servings);
    $('#recipeScaleStatus').textContent = r.baseServings > 0 && validServings(state.servings) ? '식수별 표시' : '환산 보류';
  };
  const send = $('#send');
  if (send) send.onclick = async () => {
    if (state.busy) return;
    const v = $('#suggestion').value.trim();
    if (v.length < 5 || v.length > 500) { flash('의견은 5~500자까지 입력해 주세요.'); return; }
    state.busy = true; send.disabled = true; send.textContent = '저장 중…';
    try { await handlers.onSuggestion(state.selected, v); }
    finally { state.busy = false; if (send.isConnected) { send.disabled = false; send.textContent = '의견 등록'; } }
  };
}

export function bindNav() {
  $$('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; state.selected = null; state.selectedRecipe = null; render(); scrollTo(0, 0); }; });
}

/** 목록·상세 HTML 조각 (v2 Client_04_Lists, Client_05_Detail 이식). 계산은 표시용 환산만 한다. */
import { state } from './state.js';
import { esc, fmt, validServings } from './util.js';

export const needs = (m) => Boolean(m.reviewNotes) || !m.recipe || m.actualG === null;

export function filteredMenus() {
  const q = state.search.toLowerCase().trim();
  return state.menus.filter((m) => (state.filter !== 'needs' || needs(m)) && `${m.name} ${m.recipeCode}`.toLowerCase().includes(q));
}

export function menuRows() {
  return filteredMenus().map((m) => `<button class="item ${state.selected === m.id ? 'selected' : ''}" data-menu-id="${esc(m.id)}"><span><strong>${esc(m.name)}</strong><small>${m.recipe ? '확정 연결 레시피 있음' : '레시피 미연결'}${m.reviewNotes ? ' · 확인 의견' : ''}</small></span><span class="g">${fmt(m.guideG)} g ›</span></button>`).join('')
    || '<p class="empty">검색 결과가 없습니다.</p>';
}

export function recipeRows() {
  const q = state.recipeSearch.toLowerCase().trim();
  return state.recipes.filter((r) => `${r.name} ${r.ownerSite} ${r.category}`.toLowerCase().includes(q))
    .map((r) => `<button class="item ${r.id === state.selectedRecipe ? 'selected' : ''}" data-recipe-id="${esc(r.id)}"><span><strong>${esc(r.name)}</strong><small>${esc(r.ownerSite || '사업장 정보 없음')} · ${esc(r.category || '분류 대기')}${r.baseServings === null ? ' · 기준 인분 미입력' : ''}</small></span><span class="g">›</span></button>`).join('')
    || '<p class="empty">레시피 검색 결과가 없습니다.</p>';
}

/** 기준 인분이 있을 때만 비례 환산. 없으면 원본 수량·원문 그대로. 단위는 바꾸지 않는다. */
export function ingredientLines(r, n) {
  const canScale = validServings(n) && r.baseServings > 0;
  return (r.ingredients || []).map((i) => {
    const qty = i.quantity !== null && i.quantity !== undefined
      ? `${fmt(canScale ? (i.quantity * n) / r.baseServings : i.quantity)} ${esc(i.unit || '')}`
      : esc(i.raw || '계량 정보 없음');
    const suffix = i.quantity === null ? ' <small>원문 확인</small>' : '';
    return `<div class="ingredient"><span>${esc(i.name || i.raw || '재료명 미확인')}${suffix}</span><strong>${qty}</strong></div>`;
  }).join('') || '<p class="empty">등록된 재료가 없습니다.</p>';
}

export const menuTotal = (m) => (validServings(state.servings) && m.guideG !== null ? `${fmt((m.guideG * state.servings) / 1000)} kg` : '—');

export function menuDetail() {
  const m = state.menus.find((x) => x.id === state.selected);
  if (!m) return '<p class="empty">메뉴를 선택하면 인당량과 조리량을 확인할 수 있습니다.</p>';
  const r = m.recipe, sv = validServings(state.servings) ? state.servings : '';
  return `<button class="back" data-back>← 목록으로</button><h2>${esc(m.name)}</h2><small>${esc(m.recipeCode || 'Recipe 코드 없음')} · ${esc(m.alt || 'ALT 미입력')}</small>
 <div class="metrics"><div class="metric"><label>기준 인당량</label><strong>${fmt(m.guideG)} g</strong></div><div class="metric"><label for="servings">제공 예정 식수</label><input type="number" id="servings" min="1" max="100000" step="1" value="${sv}"></div><div class="metric em"><label>필요 제공량</label><strong id="total">${menuTotal(m)}</strong></div></div>
 <div class="sub">실제 담음량 ${m.actualG === null ? '미입력' : `${fmt(m.actualG)} g`} · 공통 기준 ${fmt(m.commonGuideG)} g · 원문 비율 ${fmt(m.ratioPct)}%</div>
 <section class="section"><h3>조리 레시피</h3>${r ? `<p class="sub">확정 연결 · ${esc(r.ownerSite)} · 원본 기준 ${fmt(r.baseServings)}식</p><div id="ingredients">${ingredientLines(r, state.servings)}</div>` : '<p class="empty">확정 연결된 레시피가 없습니다. 레시피 탭에서 별도로 조회할 수 있습니다.</p>'}</section>
 <section class="section"><h3>현장 개선 의견</h3><textarea id="suggestion" class="feedback" maxlength="500" placeholder="개선 의견을 입력해 주세요 (5~500자)"></textarea><div class="row end"><button class="primary" id="send">의견 등록</button></div></section>`;
}

export function recipeDetail() {
  const r = state.recipes.find((x) => x.id === state.selectedRecipe);
  if (!r) return '<p class="empty">레시피를 선택하면 원본 배합량과 재료를 확인할 수 있습니다.</p>';
  const canScale = r.baseServings > 0 && validServings(state.servings), sv = validServings(state.servings) ? state.servings : '';
  return `<button class="back" data-back>← 레시피 목록</button><h2>${esc(r.name)}</h2><div class="sub">${esc(r.ownerSite || '사업장 미입력')} · ${esc(r.category || '분류 대기')} · 원본 기준 ${r.baseServings === null ? '기준 인분 미입력' : `${fmt(r.baseServings)}식`}</div>
 <div class="metrics"><div class="metric"><label>원본 기준 인분</label><strong>${r.baseServings === null ? '—' : `${fmt(r.baseServings)}식`}</strong></div><div class="metric"><label for="recipeServings">조회 식수</label><input type="number" id="recipeServings" min="1" max="100000" step="1" value="${sv}"></div><div class="metric em"><label>배합 환산</label><strong id="recipeScaleStatus" class="small">${canScale ? '식수별 표시' : '환산 보류'}</strong></div></div>
 ${!r.baseServings ? '<div class="notice">기준 인분이 없어 원본 배합만 표시합니다. 비례 환산하지 않습니다.</div>' : ''}
 ${r.rawBasis ? `<p class="sub">원문 배합 기준: ${esc(r.rawBasis)}</p>` : ''}
 <section class="section"><h3>재료·배합량</h3><div id="recipeIngredients">${ingredientLines(r, state.servings)}</div></section>
 ${r.notes ? `<section class="section"><h3>기록 메모</h3><p>${esc(r.notes)}</p></section>` : ''}
 <section class="section"><p class="sub">※ 레시피 원본을 표시하며, 인당량 메뉴와의 연결은 확정된 경우에만 연결합니다. g·kg·L 등 단위는 임의로 환산하지 않습니다.</p></section>`;
}

export function manageView() {
  const list = state.menus.filter(needs).map((m) => `<button class="item" data-menu-id="${esc(m.id)}"><span><strong>${esc(m.name)}</strong><small>${esc(m.reviewNotes || (!m.recipe ? '확정 레시피 미연결' : '실제 담음량 미입력'))}</small></span>›</button>`).join('')
    || '<p class="empty">확인할 항목이 없습니다.</p>';
  const logs = state.suggestions.map((s) => `<div class="log"><div class="sub">${esc(s.menuId)} · ${esc(s.status)}</div>${esc(s.message)}</div>`).join('')
    || '<div class="sub">최근 접수 의견이 없습니다.</div>';
  return `<div class="panel content"><h2>변경·확인 항목</h2><p class="sub">원본 변경 메모, 실제 담음량 미입력, 레시피 미연결 항목만 표시합니다.</p>${list}<section class="section"><h3>최근 등록 의견</h3><div class="logs">${logs}</div></section></div>`;
}

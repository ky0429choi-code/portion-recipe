/**
 * 업무 데이터 API. 원천과 계산 결과만 전달하고, 계정의 사업장 범위 밖 인당량은 서버에서 제외한다.
 * 통합 레시피는 지역 공용 자료로 보고 로그인 사용자 전체에 제공한다(범위 적용 여부는 docs-ops/확장설계.md 참고).
 * 원칙(v2 계승): ratioPct 재계산 금지, 미연결 메뉴 임의 연결 금지, 기준 인분 없는 레시피 자동 환산 금지.
 */
function getRecipes_(db) { return readRows_(db, DB_TAB.recipes).map(normalizeRecipe_); }
function getRecipeMap_(recipes) { var out = {}; recipes.forEach(function (r) { out[r.id] = r; }); return out; }
function getPortions_(db, recipeMap) { return readRows_(db, DB_TAB.portions).map(function (m) { return normalizePortion_(m, recipeMap); }); }

function apiBootstrap_(db, p, ctx) {
  var recipes = getRecipes_(db), byRecipe = getRecipeMap_(recipes);
  var menus = getPortions_(db, byRecipe).filter(function (m) { return canSeeSite_(ctx, m.siteId); });
  var visible = {}; menus.forEach(function (m) { visible[m.id] = true; });
  var suggestions = readRows_(db, DB_TAB.feedback)
    .filter(function (r) { return visible[str_(r.menuId)]; })
    .slice(-15).map(function (r) {
      return { menuId: str_(r.menuId), message: str_(r.message), status: str_(r.status), createdAt: toMs_(r.createdAt) ? new Date(toMs_(r.createdAt)).toISOString() : '' };
    });
  return {
    mode: 'ACCOUNT', user: publicUser_(ctx), menus: menus, recipes: recipes, suggestions: suggestions,
    stats: {
      menuCount: menus.length, recipeCount: recipes.length,
      linkedMenuCount: menus.filter(function (m) { return Boolean(m.recipe); }).length,
      missingBasis: recipes.filter(function (r) { return r.baseServings === null; }).length
    }
  };
}

function apiSuggestion_(db, p, ctx) {
  var id = str_(p.menuId).trim(), msg = str_(p.message).trim();
  if (msg.length < 5 || msg.length > 500) throw apiError_('INVALID_INPUT', '의견은 5~500자로 입력하세요.');
  var menu = readRows_(db, DB_TAB.portions).filter(function (m) { return str_(m.id) === id; })[0];
  if (!menu || !canSeeSite_(ctx, menu.siteId)) throw apiError_('NOT_FOUND', '등록되지 않은 메뉴입니다.');
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var now = new Date();
    appendMapped_(db, DB_TAB.feedback, {
      id: Utilities.getUuid(), createdAt: now, siteId: str_(menu.siteId), menuId: id,
      message: msg, status: '접수', adminNote: '', userId: ctx.userId
    });
    audit_(db, ctx.userId, 'FEEDBACK_CREATE', id, '개선 의견 입력');
    return { createdAt: now.toISOString(), status: '접수' };
  } finally { lock.releaseLock(); }
}

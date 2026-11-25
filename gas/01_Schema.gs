/** 시트의 열 순서가 바뀌어도 헤더명을 기준으로 논리 필드를 조회한다. */
var REQUIRED_HEADERS = Object.freeze({
  CONFIG: ['key', 'value'],
  PORTIONS: ['id', 'name', 'guideG', 'ratioPct', 'recipeLinksJson'],
  RECIPES: ['id', 'name', 'baseServings', 'ingredientsJson'],
  FEEDBACK: ['id', 'createdAt', 'siteId', 'menuId', 'message', 'status', 'adminNote'],
  AUDIT_LOG: ['id', 'createdAt', 'actor', 'action', 'entityId', 'summary'],
  USERS: ['userId', 'displayName', 'role', 'siteScope', 'status', 'passwordHash', 'mustChange',
    'passwordSetAt', 'failCount', 'lockedUntil', 'lastLoginAt'],
  SESSIONS: ['tokenHash', 'userId', 'createdAt', 'expiresAt', 'active']
});

/** setupV3()가 새로 만드는 탭의 헤더. 기존 탭은 건드리지 않는다. */
var NEW_TAB_HEADERS = Object.freeze({
  USERS: ['userId', 'displayName', 'role', 'siteScope', 'status', 'passwordHash', 'mustChange',
    'passwordSetAt', 'failCount', 'lockedUntil', 'lastLoginAt', 'note'],
  SESSIONS: ['tokenHash', 'userId', 'createdAt', 'expiresAt', 'active']
});

function normalizePortion_(m, byRecipe) {
  var links = jsonArr_(m.recipeLinksJson);
  var recipe = links.map(function (id) { return byRecipe[str_(id)]; }).filter(Boolean)[0] || null;
  return {
    id: str_(m.id), name: str_(m.name), siteId: str_(m.siteId),
    guideG: num_(m.guideG), actualG: num_(m.actualG), commonGuideG: num_(m.commonGuideG),
    ratioPct: num_(m.ratioPct), recipeCode: str_(m.recipeCode), alt: str_(m.alt), visual: str_(m.visual),
    reviewNotes: str_(m.reviewNotes), memo: str_(m.memo), recipeLinks: links, recipe: recipe
  };
}

function normalizeRecipe_(r) {
  var list = jsonArr_(r.ingredientsJson);
  return {
    id: str_(r.id), name: str_(r.name), ownerSite: str_(r.ownerSite), category: str_(r.category || '분류 대기'),
    kind: str_(r.kind), cuisines: str_(r.cuisines), baseServings: num_(r.baseServings), rawBasis: str_(r.rawBasis),
    notes: str_(r.notes), issues: jsonArr_(r.issuesJson),
    ingredients: list.map(function (i) {
      return {
        name: str_(i.name), quantity: num_(i.quantity), unit: str_(i.unit),
        raw: str_(i.raw), conversionStatus: str_(i.conversionStatus), issues: i.issues || []
      };
    }),
    steps: jsonArr_(r.stepsJson).map(String), needsBaseServings: num_(r.baseServings) === null,
    classificationPending: str_(r.category) === '분류 대기'
  };
}

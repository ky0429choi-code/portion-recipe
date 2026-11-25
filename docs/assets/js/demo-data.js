/**
 * 시연용 가상 데이터 — 실제 메뉴·레시피·수치가 아니다. (API_URL이 비어 있을 때만 사용)
 * 공개 저장소에 올라가므로 실데이터를 절대 넣지 않는다.
 */
export const DEMO_DATA = Object.freeze({
  mode: 'DEMO',
  menus: [
    { id: 'DEMO-M01', name: '가상 메뉴 A (볶음)', siteId: 'DEMO', guideG: 180, actualG: 175, commonGuideG: 180, ratioPct: 97.2, recipeCode: 'DEMO-R01', alt: 'ALT-가상', reviewNotes: '', memo: '', recipe: null },
    { id: 'DEMO-M02', name: '가상 메뉴 B (국)', siteId: 'DEMO', guideG: 250, actualG: null, commonGuideG: 240, ratioPct: null, recipeCode: 'DEMO-R02', alt: '', reviewNotes: '', memo: '', recipe: null },
    { id: 'DEMO-M03', name: '가상 메뉴 C (샐러드)', siteId: 'DEMO', guideG: 90, actualG: 95, commonGuideG: 90, ratioPct: 105.6, recipeCode: '', alt: '', reviewNotes: '시연용 확인 메모', memo: '', recipe: null }
  ],
  recipes: [
    { id: 'DEMO-R01', name: '가상 레시피 1', ownerSite: '시연 사업장', category: '메뉴', baseServings: 100, rawBasis: '100인 기준(가상)', notes: '시연 데이터입니다.',
      ingredients: [{ name: '가상 재료 가', quantity: 12, unit: 'kg', raw: '' }, { name: '가상 재료 나', quantity: 1.5, unit: 'L', raw: '' }, { name: '가상 재료 다', quantity: null, unit: '', raw: '적당량' }] },
    { id: 'DEMO-R02', name: '가상 레시피 2 (기준 인분 없음)', ownerSite: '시연 사업장', category: '분류 대기', baseServings: null, rawBasis: '', notes: '',
      ingredients: [{ name: '가상 재료 라', quantity: 3, unit: 'kg', raw: '' }] }
  ],
  suggestions: [{ menuId: 'DEMO-M01', message: '시연용 의견 예시입니다.', status: '접수', createdAt: '' }]
});

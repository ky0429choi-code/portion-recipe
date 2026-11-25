export const state = {
  menus: [], recipes: [], suggestions: [],
  tab: 'portion', selected: null, selectedRecipe: null,
  filter: 'all', search: '', recipeSearch: '', servings: 300,
  busy: false, mode: 'DEMO', user: null
};

export function applyData(data) {
  state.menus = Array.isArray(data.menus) ? data.menus : [];
  state.recipes = Array.isArray(data.recipes) ? data.recipes : [];
  state.suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  state.mode = data.mode || state.mode;
}

export function clearData() {
  Object.assign(state, { menus: [], recipes: [], suggestions: [], selected: null, selectedRecipe: null, user: null });
}

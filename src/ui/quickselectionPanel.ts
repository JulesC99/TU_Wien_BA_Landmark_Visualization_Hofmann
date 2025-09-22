import { getCategoriesState, setCategoriesState, subscribeCategories } from '../map/appState';
import { updateMapData } from '../map/updateMapData';
import { setVisibleSubcategories } from '../map/controls';
import { PRESETS, PRESET_KEY, type PresetKey } from './categoryPresets';

// Infer the category state shape directly from app state
type CatsState = ReturnType<typeof getCategoriesState>;
type Category = CatsState[number];
type Subcategory = Category['subcategories'][number];

// Handlers the renderer will receive
export type ToggleCategoryHandler = (category: Category, checked: boolean) => void;
export type ToggleSubcategoryHandler = (category: Category, sub: Subcategory, checked: boolean) => void;

// Renderer signature provided from split UI code
export type CategoryPanelRenderer = (
  containerId: string,
  cats: CatsState,
  handlers: {
    onToggleCategory: ToggleCategoryHandler;
    onToggleSubcategory: ToggleSubcategoryHandler;
  }
) => void;

export function mountCategoryPanel(
  containerId: string,
  render: CategoryPanelRenderer
): { destroy: () => void } {
  // UI-owned toggle handlers (mutate state + refresh map)
  const onToggleCategory: ToggleCategoryHandler = (category, checked) => {
    const cats = getCategoriesState().map(c => {
      if (c.name !== category.name) return c;
      const newSubs = c.subcategories.map(s => ({ ...s, visible: checked }));
      return { ...c, visible: checked, subcategories: newSubs };
    });
    setCategoriesState(cats);
    void updateMapData();
  };

  const onToggleSubcategory: ToggleSubcategoryHandler = (category, sub, checked) => {
    const cats = getCategoriesState().map(c => {
      if (c.name !== category.name) return c;
      const newSubs = c.subcategories.map(s =>
        s.name === sub.name ? { ...s, visible: checked } : s
      );
      // keep category visible if any sub is visible
      return { ...c, visible: newSubs.some(s => s.visible), subcategories: newSubs };
    });
    setCategoriesState(cats);
    void updateMapData();
  };

  // initial render
  render(containerId, getCategoriesState(), { onToggleCategory, onToggleSubcategory });

  // subscribe to state changes and re-render
  const unsubscribe = subscribeCategories((cats) => {
    render(containerId, cats, { onToggleCategory, onToggleSubcategory });
  });

  return {
    destroy() {
      unsubscribe();
    },
  };
}

// ---------------- Quick-selection wiring ----------------

export function setupQuickSelectionControls(): void {
  const byId = (id: string) => document.getElementById(id);

  const applyPreset = (key: PresetKey) => {
    setVisibleSubcategories(PRESETS[key]); // state update
    // No explicit render call needed—mountCategoryPanel's subscription re-renders automatically.
    void updateMapData();                  // refresh map data once
  };

  byId('quick-selection-hiking')?.addEventListener('click', () => applyPreset(PRESET_KEY.Hiking));
  byId('quick-selection-tourism')?.addEventListener('click', () => applyPreset(PRESET_KEY.Tourism));
  byId('quick-selection-emergency')?.addEventListener('click', () => applyPreset(PRESET_KEY.Emergency));
}

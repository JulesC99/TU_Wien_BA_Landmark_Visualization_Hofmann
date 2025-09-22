import { createPanelController, ToggleCatFn, ToggleSubFn } from '../ui/panelController';
import { VisualizationMode } from '../layers/layerStateManager';
import { setCategoriesState, getCategoriesState, subscribeCategories, setVizMode, getBaseRadiusMeters, setBaseRadiusMeters, subscribeRadius, getEffectiveRadiusMeters, subscribeEffectiveRadius, getMap } from './appState';
import { updateMapData } from './updateMapData';
import { sanitizeName } from '../layers/assetLoader';
import { PresetKey, PRESETS } from '../ui/categoryPresets';

let unsubscribeCats: (() => void) | null = null;

/**
 * Build the category tree UI and wire toggles.
 */
export async function loadCategoryDefinitions(): Promise<void> {
  try {
    const resp = await fetch('/data/subcat_definitions.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const definitions: Record<string, string[]> = await resp.json();

    const categories = Object.entries(definitions).map(([categoryName, subs]) => ({
      name: categoryName,
      visible: false,
      folded: true,
      subcategories: subs.map(subName => ({
        name: subName,
        visible: false,
        count: 0,
      })),
    }));

    setCategoriesState(categories);
  } catch (err) {
    console.error('[controls] Error loading category definitions:', err);
  }
}

// Exported convenience to re-render with current state
export function rerenderCategoryUI(): void {
  renderCategoryUIWith(getCategoriesState());
}

// Initialize once: subscribe + initial render
export function setupCategoryUI(): void {
  // initial paint
  renderCategoryUIWith(getCategoriesState());

  // subscribe once; subsequent state changes will re-render
  if (!unsubscribeCats) {
    unsubscribeCats = subscribeCategories((cats) => {
      renderCategoryUIWith(cats); // <- use fresh cats from subscription (no stale capture)
    });
  }
}

/**
 * Radio group for visualization mode (text/glyph/icon/3d...)
 * Expects inputs like: <input type="radio" name="vizMode" value="text" />
 */
export function setupVisualizationToggle(): void {
  const toolbar = document.getElementById('viz-toolbar');
  if (!toolbar) {
    console.warn('[DEBUG] setupVisualizationToggle: #viz-toolbar NOT FOUND');
    return;
  }

  // Prevent double binding if called multiple times
  if ((toolbar as any)._vizBound) {
    console.warn('[DEBUG] setupVisualizationToggle: already bound, skipping');
    return;
  }
  (toolbar as any)._vizBound = true;

  const setActiveUI = (mode: VisualizationMode) => {
    toolbar.querySelectorAll<HTMLElement>('.viz-btn').forEach(btn => {
      const isActive = btn.getAttribute('data-mode') === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  };

  const applyMode = (mode: VisualizationMode) => {
    setVizMode(mode);
    setActiveUI(mode);
    void updateMapData();
  };

  // Click handling via event delegation
  toolbar.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    const btn = t?.closest<HTMLElement>('.viz-btn[data-mode]');
    if (!btn || !toolbar.contains(btn)) return;
    const mode = btn.getAttribute('data-mode') as VisualizationMode;
    if (!mode) return;
    applyMode(mode);
  });

  // Basic keyboard support (Enter/Space)
  toolbar.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target as HTMLElement | null;
    const btn = t?.closest<HTMLElement>('.viz-btn[data-mode]');
    if (!btn || !toolbar.contains(btn)) return;
    e.preventDefault();
    const mode = btn.getAttribute('data-mode') as VisualizationMode;
    if (!mode) return;
    applyMode(mode);
  });

  // Initialize active state from any pre-marked .active button
  const initial = toolbar.querySelector<HTMLElement>('.viz-btn.active[data-mode]')
    ?.getAttribute('data-mode') as VisualizationMode | null;
  if (initial) setActiveUI(initial);
}

/** Apply a category preset and refresh the map once. */
export function setSelection(preset: PresetKey): void {
  setVisibleSubcategories(PRESETS[preset]);
  void updateMapData();
}

/**
 * Helper to turn on only a specific list of subcategories (all others off).
 * Each entry is [CategoryName, SubcategoryName].
 */
export function setVisibleSubcategories(visible: [string, string][]): void {
  const allow = new Set(
    visible.map(([cat, sub]) => `${sanitizeName(cat)}||${sanitizeName(sub)}`)
  );

  const cats = getCategoriesState().map(c => {
    const cKey = sanitizeName(c.name);
    const newSubs = c.subcategories.map(s => {
      const sKey = sanitizeName(s.name);
      const isAllowed = allow.has(`${cKey}||${sKey}`);
      return { ...s, visible: isAllowed };
    });
    return {
      ...c,
      visible: newSubs.some(s => s.visible),
      subcategories: newSubs,
    };
  });
  setCategoriesState(cats);
}

const onToggleCategory: ToggleCatFn = (category, checked) => {
  const cats = getCategoriesState().map(c => {
    if (c.name !== category.name) return c;
    const newSubs = c.subcategories.map(s => ({ ...s, visible: checked }));
    return { ...c, visible: checked, subcategories: newSubs };
  });
  setCategoriesState(cats);
  void updateMapData();
};

const onToggleSubcategory: ToggleSubFn = (category, sub, checked) => {
  const cats = getCategoriesState().map(c => {
    if (c.name !== category.name) return c;
    const newSubs = c.subcategories.map(s =>
      s.name === sub.name ? { ...s, visible: checked } : s
    );
    // original mapSetup used `.some(...)` not `.every(...)`
    return { ...c, visible: newSubs.some(s => s.visible), subcategories: newSubs };
  });
  setCategoriesState(cats);
  void updateMapData();
};

// Pure render (no side-effects besides updating the DOM)
function renderCategoryUIWith(cats: ReturnType<typeof getCategoriesState>): void {
  //renderCategoryHierarchy('poi-controls', cats, onToggleCategory, onToggleSubcategory);
  createPanelController('poi-controls', cats, onToggleCategory, onToggleSubcategory);
}
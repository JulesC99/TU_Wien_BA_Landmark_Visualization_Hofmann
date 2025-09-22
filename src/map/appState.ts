import { VisualizationMode, VisualizationModes, setPoiVisualizationMode } from '../layers/layerStateManager';
import { LAYER_IDS } from '../layers/layerIds';
import { CATEGORIZED_HEATMAP_PALETTES } from '../layers/heatmap/heatmapThemes';
import { normalizeCategory } from '../layers/heatmap/heatmapUtils';
import { setCategorizedHeatmapCategories } from '../layers/heatmap/categorizedHeatmap';
import { Category } from '../ui/panelController';

let activeMap: mapboxgl.Map | null = null;
let categoriesState: Category[] = [];
let currentVizMode: VisualizationMode = 'text' as VisualizationMode;
let baseRadiusMeters = 2000;
let effectiveRadiusMeters = 2000;

// --------- Listeners ---------

type CategoriesListener = (cats: Category[]) => void;
const categoryListeners: CategoriesListener[] = [];

type RadiusListener = (meters: number) => void;
const radiusListeners: RadiusListener[] = [];

type EffectiveRadiusListener = (meters: number) => void;
const effectiveRadiusListeners: EffectiveRadiusListener[] = [];


// --------- Subscriptions ---------

export function subscribeCategories(listener: CategoriesListener): () => void {
  categoryListeners.push(listener);
  return () => {
    const i = categoryListeners.indexOf(listener);
    if (i >= 0) categoryListeners.splice(i, 1);
  };
}

export function subscribeRadius(fn: RadiusListener): () => void {
  radiusListeners.push(fn);
  try { fn(baseRadiusMeters); } catch { }
  return () => { const i = radiusListeners.indexOf(fn); if (i >= 0) radiusListeners.splice(i, 1); };
}

export function subscribeEffectiveRadius(fn: EffectiveRadiusListener): () => void {
  effectiveRadiusListeners.push(fn);
  try { fn(effectiveRadiusMeters); } catch { }
  return () => {
    const i = effectiveRadiusListeners.indexOf(fn);
    if (i >= 0) effectiveRadiusListeners.splice(i, 1);
  };
}


// --------- Setter ---------

export function setMap(map: mapboxgl.Map | null): void {
  activeMap = map;
}

export function setCategoriesState(next: Category[]): void {
  categoriesState = next;

  for (const listener of categoryListeners) {
    try {
      listener(categoriesState);
    } catch (err) {
      console.error('[setCategoriesState] listener error:', err);
    }
  }

  const map = getMap();
  if (!map) return;

  if (currentVizMode === VisualizationModes.heatmapCategorized) {
    console.log('[appState] CATEGORIZED HEATMAP MODE');

    // 1) Layers present?
    Object.keys(CATEGORIZED_HEATMAP_PALETTES).forEach((cat) => {
      const id = `${LAYER_IDS.heatmapCategorized}-${cat}`;
      console.log('[dbg] layer exists?', id, !!map.getLayer(id));
    });

    // 2) Which layers are currently visible?
    Object.keys(CATEGORIZED_HEATMAP_PALETTES).forEach((cat) => {
      const id = `${LAYER_IDS.heatmapCategorized}-${cat}`;
      if (!map.getLayer(id)) return;
      console.log('[dbg] visibility', id, map.getLayoutProperty(id, 'visibility'));
    });

    // 3) Are we rendering any features (clusters/leaves) on the visible layers?
    Object.keys(CATEGORIZED_HEATMAP_PALETTES).forEach((cat) => {
      const id = `${LAYER_IDS.heatmapCategorized}-${cat}`;
      if (!map.getLayer(id)) return;
      const feats = map.queryRenderedFeatures({ layers: [id] });
      console.log(`[dbg] rendered ${id}:`, feats.length, feats[0]?.properties);
    });

    // Active, normalized category names
    const activeMain = categoriesState
      .filter((c) => c.visible)
      .map((c) => normalizeCategory(c.name));

    console.log('[appState] applying categorized heatmap cats:', activeMain);

    try {
      setCategorizedHeatmapCategories(map, activeMain);
    } catch (err) {
      console.warn('[setCategoriesState] failed to apply categorized heatmap cats:', activeMain, err);
    }
  }
}


export function setVizMode(mode: VisualizationMode): void {
  currentVizMode = mode;
  const map = getMap();
  if (map) {
    setPoiVisualizationMode(map, mode);
    if (mode === VisualizationModes.heatmapCategorized) {
      const activeMain = categoriesState.filter(c => c.visible).map(c => c.name);
      try { setCategorizedHeatmapCategories(map, activeMain); } catch { }
    }
  }
}

export function setBaseRadiusMeters(meters: number): void {
  const clamped = Math.max(10, Math.floor(meters));
  if (clamped === baseRadiusMeters) return;
  baseRadiusMeters = clamped;
  radiusListeners.forEach(fn => { try { fn(baseRadiusMeters); } catch { } });
}

export function setEffectiveRadiusMeters(meters: number): void {
  const clamped = Math.max(10, Math.floor(meters));
  if (clamped === effectiveRadiusMeters) return;
  effectiveRadiusMeters = clamped;
  effectiveRadiusListeners.forEach(fn => { try { fn(effectiveRadiusMeters); } catch { } });
}


// --------- Getter ---------

export function getMap(): mapboxgl.Map | null {
  return activeMap;
}

export function getCategoriesState(): Category[] {
  return categoriesState;
}

export function getBaseRadiusMeters(): number {
  return baseRadiusMeters;
}

export function getVizMode(): VisualizationMode {
  return currentVizMode;
}

export function getEffectiveRadiusMeters(): number {
  return effectiveRadiusMeters;
}

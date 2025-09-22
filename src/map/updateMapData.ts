import { getAllFeaturesForSelection, getDetailFeaturesForSelection, getPoiCountsForSelection, Viewport } from '../quadtree/quadtreeService';
import { updatePoiData, VisualizationModes } from '../layers/layerStateManager';
import { computeEffectiveZoom, getDepthForZoom } from './lodService';
import type { CategorySelection, QuadtreeFeature } from '../quadtree/types';
import { set3DLayerFeatures } from '../layers/3DLayer';
import { getMap, getCategoriesState, setCategoriesState, getBaseRadiusMeters, setEffectiveRadiusMeters, getVizMode } from './appState';
import { updatePolygonHeatmapData } from '../layers/heatmap/polygonHeatmap';
import { updateCircleHeatmapData } from '../layers/heatmap/circleHeatmap';
import { updateCategorizedHeatmapData } from '../layers/heatmap/categorizedHeatmap';
import { recompute2DLodNow } from '../layers/combined2DLayer';

/**
 * Computes the current selection (visible subcategories) from UI state.
 * Converts the category tree into a { [category]: string[] } map.
 */
export function buildCategorySelection(cats: { name: string; subcategories: { name: string; visible: boolean, count?: number }[] }[]): CategorySelection {
  return cats.reduce<CategorySelection>((sel, category) => {
    const visibleSubs = category.subcategories.filter(s => s.visible).map(s => s.name);
    if (visibleSubs.length) sel[category.name] = visibleSubs;
    return sel;
  }, {} as CategorySelection);
}

/**
 * Pulls fresh data from the quadtree given current viewport, zoom and UI selection.
 * Updates both 2D (icons/glyphs/text) and 3D layers. Also refreshes per-subcategory counts
 * using a circle around the map center (radius scales with zoom).
 */
export async function updateMapData(): Promise<void> {
  const map = getMap();
  if (!map) return;

  const categories = getCategoriesState();
  const selection = buildCategorySelection(categories);

  // --- Compute center-radius for count summary ---
  const baseZoom = 14;
  const baseRadius = getBaseRadiusMeters();
  const diff = map.getZoom() - baseZoom;
  const radiusM = baseRadius / Math.pow(2, diff);
  setEffectiveRadiusMeters(radiusM);

  if (!Object.keys(selection).length) {
    updatePoiData(map, []);
    set3DLayerFeatures(map, []);
    return;
  }

  // --- Determine depth from LOD and build Viewport bbox object ---
  const effectiveZoom = await computeEffectiveZoom(map);
  const depth = getDepthForZoom(effectiveZoom);

  const bounds = map.getBounds();
  if (!bounds) {
    console.warn('[mapSetup] Unable to retrieve map bounds.');
    return;
  }
  const viewport: Viewport = {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };

  // --- Fetch features for the current viewport ---
  const features: QuadtreeFeature[] = await getAllFeaturesForSelection(selection, depth, viewport);
  const detailFeatures: QuadtreeFeature[] = await getDetailFeaturesForSelection(selection, depth, viewport);

  // Update map layers
  updatePoiData(map, features);

  const vizMode = getVizMode();
  if (vizMode == VisualizationModes.heatmapCategorized) {
    updateCategorizedHeatmapData(map, detailFeatures);
  } else if (vizMode == VisualizationModes.threeD) {
    set3DLayerFeatures(map, features);
  }

  // ensure 2D LoD filters reflect the fresh data
  const m = getMap();
  m?.once('idle', () => recompute2DLodNow(m));

  const center = map.getCenter();
  const counts = await getPoiCountsForSelection(selection, center.lat, center.lng, radiusM);

  // --- Store counts back into state ---
  const updatedCats = categories.map(cat => {
    const subCounts = counts[cat.name] ?? {};
    return {
      ...cat,
      subcategories: cat.subcategories.map(sub => ({
        ...sub,
        count: subCounts[sub.name] || 0,
      })),
    };
  });
  setCategoriesState(updatedCats);
}

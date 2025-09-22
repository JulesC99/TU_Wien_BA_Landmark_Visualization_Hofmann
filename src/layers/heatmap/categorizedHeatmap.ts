import { ExpressionSpecification, HeatmapLayerSpecification } from "mapbox-gl";
import { HEATMAP_CATEGORIZED_SOURCE_ID, LAYER_IDS } from "../layerIds";
import { CATEGORIZED_HEATMAP_PALETTES, getCategorizedPalette } from "./heatmapThemes";
import { DATA_PROPS, normalizeCategory } from "./heatmapUtils";
import { QuadtreeFeature } from "../../quadtree/types";
import { FeatureCollection, Point } from "geojson";

export const FEATURE_TYPE = {
  detail: 'detail',
  cluster: 'cluster',
} as const;

type Visibility = 'visible' | 'none';

interface HeatmapStyleOptions {
  ramp?: string;
  intensityGain?: number;
  countCap?: number;
  visibility?: Visibility;
  opacity?: number;
}

const _style: Required<Omit<HeatmapStyleOptions, 'visibility'>> & { visibility: Visibility } = {
  ramp: 'default',
  intensityGain: 1,
  countCap: 150,
  visibility: 'visible',
  opacity: 0.7,
};

interface FilterState {
  category?: string;
  subcategory?: string;
}

const _filter: FilterState = {};

/**
 * Sets the active categories for the categorized heatmap and reapplies styling.
 * Updates internal filter/state so only the provided category keys are considered when building paint expressions and layer filters. Safe to call repeatedly.
 *
 * @param map - The Mapbox GL map instance to update.
 * @param categories - Array of category keys.
 * @returns void
 */
export function setCategorizedHeatmapCategories(map: mapboxgl.Map, categories: string[]) {
  const active = new Set((categories || []).map(c => normalizeCategory(c)));
  for (const category of Object.keys(CATEGORIZED_HEATMAP_PALETTES)) {
    const id = `${LAYER_IDS.heatmapCategorized}-${category}`;
    if (!map.getLayer(id)) continue;
    const isOn = active.has(normalizeCategory(category));
    map.setLayoutProperty(id, 'visibility', isOn ? 'visible' : 'none');
  }
}

/**
 * Shows or hides all categorized heatmap layers in one call.
 *
 * Applies a `'visible' | 'none'` layout toggle to categorized heatmap layers.
 *
 * @param map - The Mapbox GL map instance whose layers should be toggled.
 * @param visible - If true, layers are shown; if false, they are hidden.
 * @returns void
 */
export function setCategorizedHeatmapVisibility(map: mapboxgl.Map, visible: boolean) {
  const v = visible ? 'visible' : 'none';
  for (const category of Object.keys(CATEGORIZED_HEATMAP_PALETTES)) {
    const id = `${LAYER_IDS.heatmapCategorized}-${category}`;
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v);
  }
}

/**
 * Adds the categorized heatmap layers (and their sources if needed).
 *
 * Idempotent: checks for existing sources/layers and only creates what’s missing. Sets default paint and layout properties, and wires up filters for category use.
 *
 * @param map - The Mapbox GL map instance to which layers will be added.
 * @returns void
 */
export function addCategorizedHeatmapLayers(map: mapboxgl.Map) {
  if (!map.getSource(HEATMAP_CATEGORIZED_SOURCE_ID)) {
    const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    map.addSource(HEATMAP_CATEGORIZED_SOURCE_ID, { type: 'geojson', data });
  }

  for (const category of Object.keys(CATEGORIZED_HEATMAP_PALETTES)) {
    const id = `${LAYER_IDS.heatmapCategorized}-${category}`;
    if (map.getLayer(id)) continue;

    map.addLayer({
      id,
      type: 'heatmap',
      source: HEATMAP_CATEGORIZED_SOURCE_ID,
      layout: { visibility: 'none' },
      filter: [
        'any',
        ['has', 'cluster'],
        ['has', 'point_count'],
        ['all',
          ['!', ['has', 'cluster']],
          ['!', ['has', 'point_count']],
          ['==', ['downcase', ['get', DATA_PROPS.category]], normalizeCategory(category)]
        ]
      ],
      paint: buildHeatmapPaint(category),
    });
  }
}

/**
 * Applies a category / subcategory filter to the categorized heatmap.
 *
 * Updates layer filters and (re)computes paint ramps so only the requested category/subcategory contributes to the heatmap. Passing undefined clears that filter.
 *
 * @param map - The Mapbox GL map instance whose layers should be filtered.
 * @param category - Optional category key to focus on.
 * @param subcategory - Optional subcategory key to further restrict the view.
 * @returns void
 */

export function setCategorizedHeatmapFilter(
  map: mapboxgl.Map,
  category?: string,
  subcategory?: string
) {
  _filter.category = category;
  _filter.subcategory = subcategory;

  for (const cat of Object.keys(CATEGORIZED_HEATMAP_PALETTES)) {
    const id = `${LAYER_IDS.heatmapCategorized}-${cat}`;
    if (!map.getLayer(id)) continue;

    let filter: any[] = ['==', ['get', DATA_PROPS.category], cat];
    if (_filter.subcategory) {
      filter = ['all', filter, ['==', ['get', DATA_PROPS.subcategory], _filter.subcategory]];
    }
    map.setFilter(id, filter);
  }

  _style.ramp = rampNameForCategory(category);
}

/**
 * Replaces the underlying GeoJSON data for the categorized heatmap.
 *
 * Expects features carrying the category/subcategory properties used by the filters and ramps. Triggers a lightweight style refresh after `setData`.
 *
 * @param map - The Mapbox GL map instance that owns the heatmap source.
 * @param features - Array of quadtree/POI features to render in the heatmap.
 * @returns void
 */
export function updateCategorizedHeatmapData(map: mapboxgl.Map, features: QuadtreeFeature[]): void {
  const source = map.getSource(HEATMAP_CATEGORIZED_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) {
    console.error(`[categorizedHeatmap] source "${HEATMAP_CATEGORIZED_SOURCE_ID}" not found`);
    return;
  }

  const data: FeatureCollection<Point, any> = {
    type: 'FeatureCollection',
    features: features as any,
  };
  source.setData(data);
}

function rampNameForCategory(category?: string) {
  return category && CATEGORIZED_HEATMAP_PALETTES[category] ? category : 'default';
}

function buildHeatmapPaint(category: string): HeatmapLayerSpecification['paint'] {
  const countExpr: any = [
    'coalesce',
    ['to-number', ['get', DATA_PROPS.count[0]]],
    ['to-number', ['get', DATA_PROPS.count[1]]],
    ['to-number', ['get', 'point_count']], // clusters
    1
  ];
  const normCount: any = ['min', 1, ['/', ['sqrt', countExpr], Math.sqrt(_style.countCap)]];

  return {
    'heatmap-weight': buildHeatmapWeight(normCount),
    'heatmap-intensity': buildHeatmapIntensity(_style.intensityGain),
    'heatmap-radius': buildHeatmapRadius(normCount),
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0.0, getCategorizedPalette(category)[0],
      0.2, getCategorizedPalette(category)[1],
      0.4, getCategorizedPalette(category)[2],
      0.7, getCategorizedPalette(category)[3],
      1.0, getCategorizedPalette(category)[4],
    ],
    'heatmap-opacity': _style.opacity,
  };
}

function buildHeatmapWeight(normCount: any): ExpressionSpecification {
  return [
    'case',
    ['==', ['get', DATA_PROPS.type], FEATURE_TYPE.cluster],
    ['min', 0.6, ['max', 0.2, ['+', 0.2, ['*', 0.6, normCount]]]],
    1
  ];
}

function buildHeatmapIntensity(intensityGain: number): ExpressionSpecification {
  return [
    'interpolate', ['linear'], ['zoom'],
    3, 0.7 * intensityGain,
    8, 1.0 * intensityGain,
    12, 1.2 * intensityGain,
    16, 1.4 * intensityGain
  ];
}

function buildHeatmapRadius(normCount: any): ExpressionSpecification {
  return [
    'interpolate', ['linear'], ['zoom'],
    3,
    ['case',
      ['==', ['get', DATA_PROPS.type], FEATURE_TYPE.cluster],
      ['+', 10, ['*', 60, normCount]],
      10
    ],
    7,
    ['case',
      ['==', ['get', DATA_PROPS.type], FEATURE_TYPE.cluster],
      ['+', 16, ['*', 100, normCount]],
      16
    ],
    10,
    ['case',
      ['==', ['get', DATA_PROPS.type], FEATURE_TYPE.cluster],
      ['+', 26, ['*', 140, normCount]],
      26
    ],
    13,
    ['case',
      ['==', ['get', DATA_PROPS.type], FEATURE_TYPE.cluster],
      ['+', 36, ['*', 180, normCount]],
      36
    ],
    16,
    ['case',
      ['==', ['get', DATA_PROPS.type], FEATURE_TYPE.cluster],
      ['+', 54, ['*', 220, normCount]],
      54
    ]
  ];
}

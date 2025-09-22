import { DataDrivenPropertyValueSpecification, ExpressionSpecification } from "mapbox-gl";
import { LAYER_IDS } from "../layerIds";


/** Data property names used in the expressions. */
export const DATA_PROPS = {
  type: 'type',
  category: 'category',
  subcategory: 'subcategory',
  count: ['count', 'c'] as const,
} as const;

export const COUNT_CAP = 50;

export function clusterFilter(): any { return ['has', 'point_count']; }
export function pointFilter(): any { return ['!', ['has', 'point_count']]; }

/**
 * Returns the layer ID to anchor new layers "before" (for z-order).
 * Scans a preferred list and returns the first one that exists on the map.
 * If none are present, returns undefined so callers can omit the `beforeId`.
 */
export function pickInsertionAnchorLayerId(map: mapboxgl.Map): string | undefined {
  const preferred = [LAYER_IDS.textDetail, LAYER_IDS.iconDetail, LAYER_IDS.glyphDetail];
  for (const id of preferred) if (id && map.getLayer(id)) return id;
  return undefined;
}

/**
 * Normalized count in [0..1] based on sqrt(count)/sqrt(COUNT_CAP),
 * works for both clusters (point_count) and raw points (count/c).
 */
export function buildNormalizedCountExpr(COUNT_CAP = 50): ExpressionSpecification {
  const countExpr: ExpressionSpecification = [
    'coalesce',
    ['to-number', ['get', DATA_PROPS.count[0]]],
    ['to-number', ['get', DATA_PROPS.count[1]]],
    ['to-number', ['get', 'point_count']],
    1
  ];
  return ['min', 1, ['/', ['sqrt', countExpr], Math.sqrt(COUNT_CAP)]];
}

/**
 * Returns a Mapbox `circle-sort-key` expression that ranks features by normalized count.
 * Higher counts → larger sort key, so features with more density render later (on top).
 * Uses the shared COUNT_CAP via `buildNormalizedCountExpr` and scales by 1000 for precision.
 */
export function computeCircleSortKeyByNormalizedCount(): DataDrivenPropertyValueSpecification<number> {
  const n = buildNormalizedCountExpr(COUNT_CAP) as unknown as ExpressionSpecification;
  return (['*', 1000, n] as unknown) as DataDrivenPropertyValueSpecification<number>;
}


/** Opacity curve (scaled by baseOpacity) */
export function buildCircleOpacity(baseOpacity: number): ExpressionSpecification {
  const scale = (v: number) => Math.min(1, v * baseOpacity);
  return [
    'interpolate', ['linear'], ['zoom'],
    3,  scale(0.7),
    8,  scale(1.0),
    12, scale(1.2),
    16, scale(1.4),
  ];
}

export function normalizeCategory(name: string): string {
    return (name || '').toLowerCase().trim();
}

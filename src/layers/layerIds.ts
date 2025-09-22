export const SOURCE_ID = 'PoIs' as const;
export const RADIUS_PREVIEW_SOURCE_ID = 'radius-preview-src' as const;
export const HEATMAP_POLYGON_SOURCE_ID = 'poi-heatmap-polygon-src' as const;
export const HEATMAP_CIRCLE_SOURCE_ID = 'poi-heatmap-cirlce-src' as const;
export const HEATMAP_CATEGORIZED_SOURCE_ID = 'poi-heatmap-categorized-src' as const;


export const LAYER_IDS = {
  source: SOURCE_ID,

  // text
  textDetail: 'poi-text-detail',
  textCluster: 'poi-text-cluster',

  // icon
  iconDetail: 'poi-icon-detail',
  iconCluster: 'poi-icon-cluster',

  // glyph
  glyphDetail: 'poi-glyph-detail',
  glyphCluster: 'poi-glyph-cluster',

  // 3D
  model3D: 'poi-3d-model',
  model3DDetail2D: 'poi-3d-model-2d-detail',
  model3DCluster2D: 'poi-3d-model-2d-cluster',

  // heatmap
  heatmapPolygon: 'poi-heatmap-polygon',
  heatmapPolygonSource: HEATMAP_POLYGON_SOURCE_ID,
  heatmapCircle: 'poi-heatmap-circle',
  heatmapCircleSource: HEATMAP_CIRCLE_SOURCE_ID,
  heatmapCategorized: 'poi-heatmap-categorized',
  heatmapCategorizedSource: HEATMAP_CATEGORIZED_SOURCE_ID,

  // Combined 2D Layers
  combinedTextDetail: 'poi-combined-text-detail',
  combinedIconDetail: 'poi-combined-icon-detail',
  combinedGlyphDetail: 'poi-combined-glyph-detail',
  combinedTextCluster: 'poi-combined-text-cluster',
  combinedIconCluster: 'poi-combined-icon-cluster',
  combinedGlyphCluster: 'poi-combined-glyph-cluster',

  // radius preview
  radiusPreviewFill: 'radius-preview-fill',
  radiusPreviewLine: 'radius-preview-line',
  radiusSource: RADIUS_PREVIEW_SOURCE_ID
} as const;

export type LayerIdKey = keyof typeof LAYER_IDS;

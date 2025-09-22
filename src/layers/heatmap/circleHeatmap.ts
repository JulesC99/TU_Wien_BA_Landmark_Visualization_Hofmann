import { ExpressionSpecification } from "mapbox-gl";
import { HEATMAP_CIRCLE_SOURCE_ID, LAYER_IDS } from "../layerIds";
import { buildCircleOpacity, buildNormalizedCountExpr, clusterFilter, computeCircleSortKeyByNormalizedCount, COUNT_CAP, pickInsertionAnchorLayerId, pointFilter } from "./heatmapUtils";
import { SIMPLE_HEATMAP_COLORS } from "./heatmapThemes";
import { QuadtreeFeature } from "../../quadtree/types";
import { FeatureCollection, Point } from "geojson";

const baseOpacity: number = 0.8;

export function addCircleHeatmapLayer(map: mapboxgl.Map) {
  if (!map.getSource(HEATMAP_CIRCLE_SOURCE_ID)) {
    const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    map.addSource(HEATMAP_CIRCLE_SOURCE_ID, { type: 'geojson', data });
  }

  const beforeId = pickInsertionAnchorLayerId(map);
  const norm = buildNormalizedCountExpr(COUNT_CAP);

  // CLUSTERS
  const idClusters = `${LAYER_IDS.heatmapCircle}-clusters`;
  if (!map.getLayer(idClusters)) {
    map.addLayer({
      id: idClusters,
      type: 'circle',
      source: HEATMAP_CIRCLE_SOURCE_ID,
      layout: { visibility: 'none', 'circle-sort-key': computeCircleSortKeyByNormalizedCount() },
      filter: clusterFilter(),
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          3, ['+', 18, ['*', 220, norm]],
          8, ['+', 24, ['*', 260, norm]],
          12, ['+', 30, ['*', 300, norm]],
          16, ['+', 36, ['*', 340, norm]],
        ],
        'circle-color': buildCircleHeatmapColor(norm) as any,
        'circle-opacity': 1, //buildCircleOpacity(baseOpacity),
        'circle-blur': 0.35,
        'circle-pitch-alignment': 'map',
        'circle-pitch-scale': 'map',
      },
    }, beforeId);
  } else console.error("Layer exists already");
  

  // DETAILS
  const idPoints = `${LAYER_IDS.heatmapCircle}-points`;
  if (!map.getLayer(idPoints)) {
    map.addLayer({
      id: idPoints,
      type: 'circle',
      source: HEATMAP_CIRCLE_SOURCE_ID,
      layout: { visibility: 'none', 'circle-sort-key': computeCircleSortKeyByNormalizedCount() },
      filter: pointFilter(),
      paint: {
        'circle-radius': 100,
        'circle-color': buildCircleHeatmapColor(norm) as any,
        //'circle-opacity': 1, // buildCircleOpacity(0.95),
        //'circle-blur': 0.35,
        'circle-pitch-alignment': "map",
        'circle-pitch-scale': 'map',
      },
    }, beforeId);
   } else console.error("Layer exists already");
}

export function setCircleHeatmapVisibility(map: mapboxgl.Map, visible: boolean) {
  const v = visible ? 'visible' : 'none';
  for (const suffix of ['clusters', 'points']) {
    const id = `${LAYER_IDS.heatmapCircle}-${suffix}`;
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v);
  }
}

export function updateCircleHeatmapData(map: mapboxgl.Map, features: QuadtreeFeature[]): void {
  const source = map.getSource(HEATMAP_CIRCLE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) {
    console.error(`[circleHeatmap] source "${HEATMAP_CIRCLE_SOURCE_ID}" not found`);
    return;
  }
  
  const data: FeatureCollection<Point, any> = {
    type: 'FeatureCollection',
    features: features,
  };
  source.setData(data);
}

function buildCircleHeatmapColor(normCount: ExpressionSpecification): ExpressionSpecification {
  return [
    'interpolate', ['linear'], normCount,
    0.00, 'rgba(255, 246, 163, 0.35)',
    0.10, SIMPLE_HEATMAP_COLORS[0],
    0.35, SIMPLE_HEATMAP_COLORS[1],
    0.60, SIMPLE_HEATMAP_COLORS[2],
    0.85, SIMPLE_HEATMAP_COLORS[3],
    1.00, SIMPLE_HEATMAP_COLORS[4],
  ];
}
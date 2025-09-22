import { QuadtreeFeature } from "../../quadtree/types";
import { HEATMAP_POLYGON_SOURCE_ID, LAYER_IDS } from "../layerIds";
import { circlePolygon } from "../radiusPreview";
import { SIMPLE_HEATMAP_COLORS } from "./heatmapThemes";
import { COUNT_CAP, pickInsertionAnchorLayerId } from "./heatmapUtils";


export function addPolygonHeatmapLayer(map: mapboxgl.Map) {
    if (!map.getSource(HEATMAP_POLYGON_SOURCE_ID)) {
        const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
        map.addSource(HEATMAP_POLYGON_SOURCE_ID, { type: 'geojson', data });
    }

    if (!map.getLayer(LAYER_IDS.heatmapPolygon)) {
        const beforeId = pickInsertionAnchorLayerId(map);
        map.addLayer({
            id: LAYER_IDS.heatmapPolygon,
            type: 'fill',
            source: HEATMAP_POLYGON_SOURCE_ID,
            layout: {
                'fill-sort-key': ['+', ['*', ['get', 'w'], 1000], ['get', 'r']],
                'visibility': 'none'
            },
            paint: {
                'fill-color': buildPolygonHeatmapColor(['get', 'w']),
                //'fill-opacity': 1,// buildCircleOpacity(baseOpacity),
                'fill-outline-color': 'rgba(0,0,0,0)'
            }
        }, beforeId || undefined);
    }
}

export function updatePolygonHeatmapData(map: mapboxgl.Map, features?: QuadtreeFeature[]): void {
    const src = map.getSource(HEATMAP_POLYGON_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!src) {
        console.error(`[polygonHeatmap] source "${HEATMAP_POLYGON_SOURCE_ID}" not found`);
        return;
      }

    const fc = features && Array.isArray(features)
        ? buildPolygonCirclesFromArray(map, features)
        : buildPolygonCirclesFromSource(map);

    src.setData(fc);
}

export function setPolygonHeatmapVisibility(map: mapboxgl.Map, visible: boolean): void {
    const id = LAYER_IDS.heatmapPolygon;
    if (!map.getLayer(id)) return;
    map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

function buildPolygonCirclesFromArray(map: mapboxgl.Map, features: any[]): GeoJSON.FeatureCollection<GeoJSON.Polygon, any> {
    const zoom = map.getZoom();
    const b = map.getBounds?.() ?? null;

    const out: GeoJSON.Feature<GeoJSON.Polygon, any>[] = [];
    for (const f of features) {
        if (!f?.geometry || f.geometry.type !== 'Point') continue;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        const [lng, lat] = coords;
        if (!boundsContains(b, lng, lat)) continue;

        const p = f.properties || {};
        // prefer aggregated counts if provided by your quadtree, else default to 1
        const count = Number(p.count ?? p.c ?? 1);
        const isCluster = Number(p.point_count ?? 0) > 0; // will be false for raw points
        const w = normalizeWeight(isCluster ? Number(p.point_count) : count);
        const r = featureRadiusMeters(zoom, w, isCluster);

        const poly = circlePolygon(lng, lat, r, 64);
        out.push({ type: 'Feature', geometry: poly, properties: { w, r, isCluster: isCluster ? 1 : 0 } });
    }

    return { type: 'FeatureCollection', features: out };
}

function buildPolygonCirclesFromSource(map: mapboxgl.Map): GeoJSON.FeatureCollection<GeoJSON.Polygon, any> {
    const src = map.getSource(HEATMAP_POLYGON_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return { type: 'FeatureCollection', features: [] };

    const ds: any = (src as any)._data || (src as any).serialize?.() || null;
    const feats: any[] = Array.isArray(ds?.features) ? ds.features : [];

    return buildPolygonCirclesFromArray(map, feats);
}

function buildPolygonHeatmapColor(normCount: any): any {
    return [
        'interpolate', ['linear'], normCount,
        0.00, 'rgba(255,255,255,0)',
        0.10, SIMPLE_HEATMAP_COLORS[0],
        0.35, SIMPLE_HEATMAP_COLORS[1],
        0.60, SIMPLE_HEATMAP_COLORS[2],
        0.85, SIMPLE_HEATMAP_COLORS[3],
        1.00, SIMPLE_HEATMAP_COLORS[4],
    ];
}

// Safe bounds check
function boundsContains(b: mapboxgl.LngLatBounds | null, lng: number, lat: number): boolean {
    if (!b) return true;
    return lng >= b.getWest() && lng <= b.getEast() && lat >= b.getSouth() && lat <= b.getNorth();
}

// Normalize count to [0..1] with cap
function normalizeWeight(count: number): number {
    const c = Math.max(0, Number.isFinite(count) ? count : 1);
    return Math.max(0, Math.min(1, c / COUNT_CAP));
}

// Zoom → base radius (meters) — tuned to feel like your old heatmap radius
function baseRadiusMeters(zoom: number): number {
    if (zoom < 6) return 5000;
    if (zoom < 8) return 3000;
    if (zoom < 10) return 1800;
    if (zoom < 12) return 900;
    if (zoom < 14) return 450;
    if (zoom < 16) return 220;
    return 130;
}

// Final radius per feature (meters)
function featureRadiusMeters(zoom: number, weight: number, isCluster: boolean): number {
    const base = baseRadiusMeters(zoom) * (isCluster ? 1.0 : 0.65);
    // slight growth with weight; sqrt keeps large counts less explosive
    return base * (0.5 + 0.9 * Math.sqrt(weight));
}
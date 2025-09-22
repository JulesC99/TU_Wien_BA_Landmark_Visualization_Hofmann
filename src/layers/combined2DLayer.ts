import mapboxgl from 'mapbox-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { LAYER_IDS, SOURCE_ID } from './layerIds';

// ---------------- Proximity thresholds (meters) ----------------
const CLOSE_RADIUS = 1500;  // <= close -> icon
const MID_RADIUS = 4000;  // <= mid   -> glyph ; > -> text

// ---------------- Internal state (simple working sets) ----------------
type FeatureId = string | number;
type Visual2D = 'icon' | 'glyph' | 'text';
type Kind = 'detail' | 'cluster';

const detailIds: Record<Visual2D, Set<FeatureId>> = {
    icon: new Set(), glyph: new Set(), text: new Set(),
};
const clusterIds: Record<Visual2D, Set<FeatureId>> = {
    icon: new Set(), glyph: new Set(), text: new Set(),
};

// init guard so wiring only happens once per map
const INIT_FLAG = '__combined2D_inited';

// debug
const LOD2D_DEBUG = false;
function dbg(...args: any[]) { if (LOD2D_DEBUG) console.debug('[2D-LOD]', ...args); }


// ---------------- Public: add layers (idempotent) ----------------

/** Convenience: add all six combined layers (idempotent). */
export function ensureCombined2DLayers(map: mapboxgl.Map): void {
    add2DCombinedIconDetailLayer(map);
    add2DCombinedGlyphDetailLayer(map);
    add2DCombinedTextDetailLayer(map);
    add2DCombinedIconClusterLayer(map);
    add2DCombinedGlyphClusterLayer(map);
    add2DCombinedTextClusterLayer(map);
}

/** Toggle visibility for all six combined layers. */
export function setCombinedVisibility(map: mapboxgl.Map, visible: boolean): void {
    const ids = [
        LAYER_IDS.combinedIconDetail, LAYER_IDS.combinedGlyphDetail, LAYER_IDS.combinedTextDetail,
        LAYER_IDS.combinedIconCluster, LAYER_IDS.combinedGlyphCluster, LAYER_IDS.combinedTextCluster,
    ];
    for (const id of ids) if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
}

/** One-time wiring: recompute on moveend/zoomend and once on idle. */
export function init2DLod(map: mapboxgl.Map): void {
    if ((map as any)[INIT_FLAG]) return;
    (map as any)[INIT_FLAG] = true;

    if (LOD2D_DEBUG) attach2DLodDebug(map);

    map.once('idle', () => recompute2DLodNow(map));
    map.on('moveend', () => recompute2DLodNow(map));
    map.on('zoomend', () => recompute2DLodNow(map));
}


function add2DCombinedTextClusterLayer(map: mapboxgl.Map): void {
    if (!map.getLayer(LAYER_IDS.combinedTextCluster)) {
        map.addLayer({
            id: LAYER_IDS.combinedTextCluster,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['==', ['get', 'type'], 'cluster'],
            layout: {
                'text-field': ['get', 'label'],
                'text-font': ['Open Sans Bold'],
                'text-size': 25,
                'text-allow-overlap': false,
                'text-ignore-placement': true,
            },
            paint: {
                'text-color': '#fff',
                'text-halo-color': '#444444',
                'text-halo-width': 0.8,
            },
        });
    }
}

function add2DCombinedIconClusterLayer(map: mapboxgl.Map): void {
    if (!map.getLayer(LAYER_IDS.combinedIconCluster)) {
        map.addLayer({
            id: LAYER_IDS.combinedIconCluster,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['==', ['get', 'type'], 'cluster'],
            layout: {
                'icon-image': ['get', 'iconName'],
                'icon-size': 0.15,
                'icon-allow-overlap': false,
                'visibility': 'none'
            },
        });
    }
}

function add2DCombinedGlyphClusterLayer(map: mapboxgl.Map): void {
    if (!map.getLayer(LAYER_IDS.combinedGlyphCluster)) {
        map.addLayer({
            id: LAYER_IDS.combinedGlyphCluster,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['==', ['get', 'type'], 'cluster'],
            layout: {
                'icon-image': ['get', 'glyphName'],
                'icon-size': 0.1,
                'icon-allow-overlap': false,
                'visibility': 'none'
            },
        });
    }
}

function add2DCombinedTextDetailLayer(map: mapboxgl.Map): void {
    if (!map.getLayer(LAYER_IDS.combinedTextDetail)) {
        map.addLayer({
            id: LAYER_IDS.combinedTextDetail,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['==', ['get', 'type'], 'detail'],
            layout: {
                'text-field': ['get', 'label'],
                'text-font': ['Open Sans Bold'],
                'text-size': 25,
                'text-allow-overlap': false,
            },
            paint: {
                'text-color': '#fff',
                'text-halo-color': '#444444',
                'text-halo-width': 0.8,
            },
        });
    }
}

function add2DCombinedGlyphDetailLayer(map: mapboxgl.Map): void {
    if (!map.getLayer(LAYER_IDS.combinedGlyphDetail)) {
        map.addLayer({
            id: LAYER_IDS.combinedGlyphDetail,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['==', ['get', 'type'], 'detail'],
            layout: {
                'icon-image': ['get', 'glyphName'],
                'icon-size': 0.1,
                'icon-allow-overlap': false,
                'visibility': 'none'
            },
        });
    }
}

function add2DCombinedIconDetailLayer(map: mapboxgl.Map): void {
    if (!map.getLayer(LAYER_IDS.combinedIconDetail)) {
        map.addLayer({
            id: LAYER_IDS.combinedIconDetail,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['==', ['get', 'type'], 'detail'],
            layout: {
                'icon-image': ['get', 'iconName'],
                'icon-size': 0.15,
                'icon-allow-overlap': false,
                'visibility': 'none'
            },
        });
    }
}

// ------------------ LOD ------------------

/** Recompute sets + push filters. Call after source.setData too. */
export function recompute2DLodNow(map: mapboxgl.Map): void {
    const feats = getAllPointFeatures(map);

    if (!feats.length) {
        applyFilters(map);
        return;
    }

    // clear buckets
    for (const s of Object.values(detailIds)) s.clear();
    for (const s of Object.values(clusterIds)) s.clear();

    const cam = map.getFreeCameraOptions();
    const center = cam.position ? cam.position.toLngLat() : map.getCenter();

    for (const f of feats) {
        const props: any = f.properties || {};
        const id = props.id ?? f.id;
        if (id == null) continue;

        const coords = (f.geometry as any)?.coordinates as [number, number] | undefined;
        if (!coords) continue;

        const kind = inferKind((f.properties as any) || {});
        const dist = center.distanceTo(new mapboxgl.LngLat(coords[0], coords[1]));
        const vis = pickVisual(dist); // 'icon' | 'glyph' | 'text'

        if (kind === 'detail') detailIds[vis].add(id);
        else clusterIds[vis].add(id);
    }

    applyFilters(map);
}

// ------------------ helpers ------------------

/** Robustly infer cluster vs detail from current data */
function inferKind(props: any): Kind {
    const t = props?.type;
    if (t === 'detail' || t === 'cluster') return t;
    if (typeof props?.isCluster === 'boolean') return props.isCluster ? 'cluster' : 'detail';
    if (typeof props?.count === 'number') return props.count > 1 ? 'cluster' : 'detail';
    return 'detail';
}

/** Distance → visual mapping (same for cluster & detail) */
function pickVisual(d: number): Visual2D {
    if (d <= CLOSE_RADIUS) return 'text';
    if (d <= MID_RADIUS) return 'icon';
    return 'glyph';
}

function applyFilters(map: mapboxgl.Map): void {
    const toArr = (s: Set<string | number>) => Array.from(s);
    const byPropId = (ids: (string | number)[]) =>
        ['in', ['get', 'id'], ['literal', ids]] as any;  // <-- property-based, not feature-id

    // DETAIL
    if (map.getLayer(LAYER_IDS.combinedIconDetail)) {
        map.setFilter(LAYER_IDS.combinedIconDetail, byPropId(toArr(detailIds.icon)));
    }
    if (map.getLayer(LAYER_IDS.combinedGlyphDetail)) {
        map.setFilter(LAYER_IDS.combinedGlyphDetail, byPropId(toArr(detailIds.glyph)));
    }
    if (map.getLayer(LAYER_IDS.combinedTextDetail)) {
        map.setFilter(LAYER_IDS.combinedTextDetail, byPropId(toArr(detailIds.text)));
    }

    // CLUSTER
    if (map.getLayer(LAYER_IDS.combinedIconCluster)) {
        map.setFilter(LAYER_IDS.combinedIconCluster, byPropId(toArr(clusterIds.icon)));
    }
    if (map.getLayer(LAYER_IDS.combinedGlyphCluster)) {
        map.setFilter(LAYER_IDS.combinedGlyphCluster, byPropId(toArr(clusterIds.glyph)));
    }
    if (map.getLayer(LAYER_IDS.combinedTextCluster)) {
        map.setFilter(LAYER_IDS.combinedTextCluster, byPropId(toArr(clusterIds.text)));
    }
}


/** Prefer raw geojson in source; fallback to querySourceFeatures */
function getAllPointFeatures(map: mapboxgl.Map): Feature<Point, any>[] {
    const src: any = map.getSource(SOURCE_ID);
    let coll: FeatureCollection<Point, any> | undefined;
    try { coll = (src && (src._data ?? src.serialize?.().data)) as any; } catch { }
    if (coll?.type === 'FeatureCollection') {
        return (coll.features ?? []).filter(f => f.geometry?.type === 'Point') as any;
    }
    const feats = map.querySourceFeatures(SOURCE_ID) as any[];
    return feats.filter(f => f.geometry?.type === 'Point') as any;
}

function toId(f: Feature<Point, any>): FeatureId | null {
    return (f.id as any) ?? (f.properties?.id as any) ?? null;
}


function attach2DLodDebug(map: mapboxgl.Map) {
    const ids = [
        LAYER_IDS.combinedIconDetail, LAYER_IDS.combinedGlyphDetail, LAYER_IDS.combinedTextDetail,
        LAYER_IDS.combinedIconCluster, LAYER_IDS.combinedGlyphCluster, LAYER_IDS.combinedTextCluster,
    ];

    function layerSnapshot(id: string) {
        const exists = !!map.getLayer(id);
        const vis = exists ? (map.getLayoutProperty(id, 'visibility') as any) : 'missing';
        const filter = exists ? map.getFilter(id) : null;
        return { id, exists, vis, filter };
    }

    function sourceFeaturesCount() {
        try {
            const feats = map.querySourceFeatures(SOURCE_ID);
            if (feats?.length) return feats.length;
        } catch { }
        try {
            const src: any = map.getSource(SOURCE_ID);
            const raw = src && (src._data || src.serialize?.().data);
            return raw?.features?.length ?? 0;
        } catch { }
        return 0;
    }

    // these names appear on window.lod2d
    const api = {
        layers() { return ids.map(layerSnapshot); },
        status() {
            return {
                sourceId: SOURCE_ID,
                sourceFeatures: sourceFeaturesCount(),
                // if your file names differ, adjust the variable names below
                detail: {
                    icon: (detailIds?.icon?.size ?? 0),
                    glyph: (detailIds?.glyph?.size ?? 0),
                    text: (detailIds?.text?.size ?? 0),
                },
                cluster: {
                    icon: (clusterIds?.icon?.size ?? 0),
                    glyph: (clusterIds?.glyph?.size ?? 0),
                    text: (clusterIds?.text?.size ?? 0),
                },
                filters: ids.reduce((o, id) => { o[id] = map.getFilter(id); return o; }, {} as Record<string, any>),
            };
        },
        forceVisible() {
            ids.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible'); });
            return 'ok';
        },
        setFilterTrue() {
            ids.forEach(id => { if (map.getLayer(id)) map.setFilter(id, true as any); });
            return 'ok';
        },
    };
}
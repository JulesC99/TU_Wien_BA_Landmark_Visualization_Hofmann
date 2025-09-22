import { getMap } from '../map/appState';
import { LAYER_IDS, RADIUS_PREVIEW_SOURCE_ID } from './layerIds';

// Create a polygon circle around [lng,lat] with radius in meters.
export function circlePolygon(lng: number, lat: number, radiusM: number, steps = 96): GeoJSON.Polygon {
    const R = 6371008.8; // Earth mean radius
    const φ1 = (lat * Math.PI) / 180;
    const λ1 = (lng * Math.PI) / 180;
    const δ = radiusM / R;

    const ring: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const θ = (2 * Math.PI * i) / steps;
        const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
        const sinδ = Math.sin(δ), cosδ = Math.cos(δ);
        const sinθ = Math.sin(θ), cosθ = Math.cos(θ);

        const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * cosθ;
        const φ2 = Math.asin(sinφ2);
        const y = sinθ * sinδ * cosφ1;
        const x = cosδ - sinφ1 * sinφ2;
        const λ2 = λ1 + Math.atan2(y, x);

        const lon = ((λ2 * 180) / Math.PI + 540) % 360 - 180;
        const lat2 = (φ2 * 180) / Math.PI;
        ring.push([lon, lat2]);
    }
    return { type: 'Polygon', coordinates: [ring] };
}

// initializes the radius preview
export function initRadiusPreview(): void {
    const map = getMap();
    if (!map || !map.isStyleLoaded()) {
        // Try again once the style is loaded
        getMap()?.once('load', () => initRadiusPreview());
        return;
    }

    if (!map.getSource(RADIUS_PREVIEW_SOURCE_ID)) {
        map.addSource(RADIUS_PREVIEW_SOURCE_ID, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
        } as any);
    }

    if (!map.getLayer(LAYER_IDS.radiusPreviewFill)) {
        map.addLayer({
            id: LAYER_IDS.radiusPreviewFill,
            type: 'fill',
            source: RADIUS_PREVIEW_SOURCE_ID,
            paint: {
                'fill-color': '#3b82f6',
                'fill-opacity': 0.12,
            },
            layout: { visibility: 'none' },
        });
    }

    if (!map.getLayer(LAYER_IDS.radiusPreviewLine)) {
        map.addLayer({
            id: LAYER_IDS.radiusPreviewLine,
            type: 'line',
            source: RADIUS_PREVIEW_SOURCE_ID,
            paint: {
                'line-color': '#3b82f6',
                'line-width': 2,
                'line-opacity': 0.7,
            },
            layout: { visibility: 'none' },
        });
    }
}

// Show/update the preview circle for a given center & radius (m).
export function showRadiusPreview(center: mapboxgl.LngLatLike, radiusM: number): void {
    const map = getMap();
    if (!map) return;
    initRadiusPreview();

    const src = map.getSource(RADIUS_PREVIEW_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    const { lng, lat } = (center as mapboxgl.LngLatLike) as any;
    const poly = circlePolygon(
        typeof lng === 'number' ? lng : (center as any)[0],
        typeof lat === 'number' ? lat : (center as any)[1],
        radiusM
    );

    src.setData({ type: 'Feature', geometry: poly, properties: {} } as any);
    if (map.getLayer(LAYER_IDS.radiusPreviewFill)) map.setLayoutProperty(LAYER_IDS.radiusPreviewFill, 'visibility', 'visible');
    if (map.getLayer(LAYER_IDS.radiusPreviewLine)) map.setLayoutProperty(LAYER_IDS.radiusPreviewLine, 'visibility', 'visible');
}

// Hide the preview circle.
export function hideRadiusPreview(): void {
    const map = getMap();
    if (!map) return;
    if (map.getLayer(LAYER_IDS.radiusPreviewFill)) map.setLayoutProperty(LAYER_IDS.radiusPreviewFill, 'visibility', 'none');
    if (map.getLayer(LAYER_IDS.radiusPreviewLine)) map.setLayoutProperty(LAYER_IDS.radiusPreviewLine, 'visibility', 'none');
}

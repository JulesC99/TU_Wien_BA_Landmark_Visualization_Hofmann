/**
 * Samples terrain elevation at the four corners of the current viewport plus the map center, computes the camera’s altitude above ground level at each point, and returns the average altitude.
 *
 * @param map - The Mapbox GL map instance.
 * @returns A promise that resolves to the average camera altitude above ground in meters.
 */
export async function getAverageAltitudeAGL(map: mapboxgl.Map): Promise<number> {
  const bounds = map.getBounds();
  if (!bounds) {
    return 1; // Fallback minimal altitude if bounds are unavailable
  }

  // Sample the four corners and center of the viewport
  const samplePoints = [
    bounds.getSouthWest(),
    bounds.getNorthWest(),
    bounds.getNorthEast(),
    bounds.getSouthEast(),
    map.getCenter(),
  ];

  // Query terrain elevation (in meters) at each sample point
  const elevations = await Promise.all(
    samplePoints.map(p => map.queryTerrainElevation(p, { exaggerated: false }) ?? 0)
  );

  // Camera altitude from Mapbox’s FreeCameraOptions
  const cameraAltitude = map.getFreeCameraOptions().position?.toAltitude() ?? 0;

  // Compute altitude above ground for each sample, minimum 1m
  const agls = elevations.map(e => Math.max(cameraAltitude - e, 1));

  // Return the arithmetic mean
  const sum = agls.reduce((acc, a) => acc + a, 0);
  return sum / agls.length;
}

/**
 * Converts a camera altitude above ground and vertical field-of-view into an equivalent Mercator zoom level.
 *
 * @param altitudeAGL - Camera altitude above ground in meters.
 * @param verticalFovRad - Vertical field of view in radians.
 * @returns The equivalent map zoom level (base-2 logarithm of world span).
 */
export function computeGeometryZoom(
  altitudeAGL: number,
  verticalFovRad: number
): number {
  const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6_378_137;
  const safeAltitude = Math.max(altitudeAGL, 0.001);
  const visibleSpan = 2 * safeAltitude * Math.tan(verticalFovRad / 2);
  const ratio = EARTH_CIRCUMFERENCE / visibleSpan;
  return Math.log2(ratio);
}

/**
 * Blends the map’s current zoom level with a geometry-derived zoom, weighted by the camera’s pitch angle. 
 * At low pitch (looking down), uses more geometryZoom; at high pitch (looking horizontally), uses more mapZoom.
 *
 * @param map - The Mapbox GL map instance.
 * @returns A promise that resolves to the blended effective zoom level.
 */
export async function computeEffectiveZoom(map: mapboxgl.Map): Promise<number> {
  const mapZoom = map.getZoom();
  const pitch = map.getPitch();
  const fovRad = (map.transform.fov * Math.PI) / 180;

  // Compute geometry‐based zoom from average altitude
  const altitudeAGL = await getAverageAltitudeAGL(map);
  const geomZoom = computeGeometryZoom(altitudeAGL, fovRad);

  // Blend factor: 0 at pitch ≤30°, 1 at pitch ≥60°
  const t = Math.min(Math.max((pitch - 30) / 30, 0), 1);
  return mapZoom * (1 - t) + geomZoom * t;
}

/**
 * Maps a continuous zoom value to a discrete quadtree depth (1–6).
 *
 * @param zoom - The zoom level to convert.
 * @returns An integer depth: 1 (coarsest) through 6 (finest).
 */
export function getDepthForZoom(zoom: number): number {
  if (zoom <= 8) return 1;
  if (zoom <= 9) return 2;
  if (zoom <= 12) return 3;
  if (zoom <= 14) return 4;
  if (zoom <= 15) return 5;
  return 6;
}

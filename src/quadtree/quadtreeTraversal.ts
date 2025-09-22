import type { QuadtreeNode, QuadtreeFeature } from './types';
import { GlyphRegistry, IconRegistry, ModelRegistry } from '../layers/assetRegistry';

/**
 * Builds GeoJSON Features (clusters or detail points) from a quadtree at a specific depth.
 *
 * - Internal nodes at the target depth become cluster features.
 * - Leaf nodes become detail features.
 *
 * @param root - Root node of the quadtree.
 * @param depth - Target depth level (0 = root).
 * @param category - Category name for icon selection and properties.
 * @param subcat - Subcategory name for icon selection and properties.
 * @returns Array of GeoJSON Features ready to render.
 */
export function buildFeaturesAtDepth(
  root: QuadtreeNode,
  depth: number,
  category: string,
  subcat: string
): QuadtreeFeature[] {
  const nodes = collectNodesAtDepth(root, 0, depth);
  const features: QuadtreeFeature[] = [];

  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      // Cluster feature
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: node.averagePosition ?? [0, 0],
        },
        properties: {
          type: 'cluster',
          iconName: getIconFilepath(subcat, true),
          glyphName: getGlyphFilepath(subcat),
          modelName: getModelFilepath(subcat),
          icon3DName: getIcon3DFilepath(subcat, true),
          category,
          subcat,
          label: getClusterLabel(subcat, node.poiCount),
          count: node.poiCount,
        },
      });
    } else {
      // Detail features
      for (const raw of node.data) {
        features.push({
          ...raw,
          properties: {
            ...raw.properties,
            type: 'detail',
            iconName: getIconFilepath(subcat, false),
            glyphName: getGlyphFilepath(subcat),
            modelName: getModelFilepath(subcat),
            icon3DName: getIcon3DFilepath(subcat, false),
            category,
            subcat,
            label: raw.properties!.name || getClusterLabel(subcat, 1),
          },
        });
      }
    }
  }

  return features;
}

/**
 * Builds GeoJSON Features (detail points only) from a quadtree at a specific depth.
 *
 * @param root - Root node of the quadtree.
 * @param depth - Target depth level (0 = root).
 * @param category - Category name for icon selection and properties.
 * @param subcat - Subcategory name for icon selection and properties.
 * @returns Array of GeoJSON Features ready to render.
 */
export function buildDetailFeaturesAtDepth(
  root: QuadtreeNode,
  depth: number,
  category: string,
  subcat: string
): QuadtreeFeature[] {
  // First pick the nodes at the requested depth...
  const nodes = collectNodesAtDepth(root, 0, depth);

  // ...then expand any cluster nodes down to their leaves and emit *real* detail features.
  const out: QuadtreeFeature[] = [];
  for (const node of nodes) {
    collectLeafDetailFeatures(node, category, subcat, out);
  }
  return out;
}

/**
 * Determines if a latitude/longitude circle intersects a bounding box.
 *
 * @param bbox - Bounding box with { south, west, north, east }.
 * @param centerLat - Circle center latitude.
 * @param centerLon - Circle center longitude.
 * @param radiusM - Circle radius in meters.
 * @returns True if the circle and bbox overlap.
 */
export function bboxIntersectsCircle(
  bbox: { south: number; west: number; north: number; east: number },
  centerLat: number,
  centerLon: number,
  radiusM: number
): boolean {
  // Clamp center to bbox to find the closest point
  const clampedLat = Math.max(bbox.south, Math.min(centerLat, bbox.north));
  const clampedLon = Math.max(bbox.west, Math.min(centerLon, bbox.east));
  // Distance from center to that point
  return getDistanceMeters(centerLat, centerLon, clampedLat, clampedLon) <= radiusM;
}

/**
 * Counts how many POIs (detail points) within the quadtree node fall inside the specified circle.
 * Prunes entire branches if the node's bbox does not intersect the circle.
 *
 * @param node - Quadtree node to traverse.
 * @param centerLat - Circle center latitude.
 * @param centerLon - Circle center longitude.
 * @param radiusM - Circle radius in meters.
 * @returns Number of POIs within the circle.
 */
export function countPoisInCircle(
  node: QuadtreeNode,
  centerLat: number,
  centerLon: number,
  radiusM: number
): number {
  // Prune if bbox is completely outside the circle
  if (!bboxIntersectsCircle(node.bbox, centerLat, centerLon, radiusM)) {
    return 0;
  }
  // Recurse into children if present
  if (node.children && node.children.length > 0) {
    return node.children.reduce(
      (sum, child) => sum + countPoisInCircle(child, centerLat, centerLon, radiusM),
      0
    );
  }
  // Leaf: test each point individually
  return node.data.reduce((count, feat) => {
    const [lon, lat] = feat.geometry.coordinates;
    return count + (getDistanceMeters(centerLat, centerLon, lat, lon) <= radiusM ? 1 : 0);
  }, 0);
}

/**
 * Recursively collects all nodes at exactly the target depth. If a leaf is encountered before the target, it is included.
 *
 * @param node - Current quadtree node.
 * @param curDepth - Current depth level.
 * @param targetDepth - Desired depth level.
 * @returns Array of nodes at or before the target depth.
 */
function collectNodesAtDepth(
  node: QuadtreeNode,
  curDepth: number,
  targetDepth: number
): QuadtreeNode[] {
  if (curDepth === targetDepth || !node.children || node.children.length === 0) {
    return [node];
  }
  return node.children.flatMap(child =>
    collectNodesAtDepth(child, curDepth + 1, targetDepth)
  );
}

function collectLeafDetailFeatures(
  node: QuadtreeNode,
  category: string,
  subcat: string,
  out: QuadtreeFeature[]
): void {
  // If the node has children, recurse until leaves
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      collectLeafDetailFeatures(child, category, subcat, out);
    }
    return;
  }

  // Leaf → emit each raw POI as a proper detail feature
  if (node.data && node.data.length) {
    for (const raw of node.data) {
      out.push({
        ...raw,
        properties: {
          ...raw.properties,
          type: 'detail',
          // keep the same asset-selection logic used elsewhere in this file
          iconName: getIconFilepath(subcat, false),
          glyphName: getGlyphFilepath(subcat),
          modelName: getModelFilepath(subcat),
          icon3DName: getIcon3DFilepath(subcat, false),
          category,
          subcat,
          label: raw.properties?.name || getClusterLabel(subcat, 1),
        },
      });
    }
  }
}

/**
 * Chooses an icon filename based on subcategory or fallback.
 *
 * @param name - Base name (subcategory or category).
 * @param isCluster - Whether this is a cluster icon.
 * @returns Icon filename (e.g. "tree_group.png").
 */
function getIconFilepath(name: string, isCluster: boolean): string {
  const suffix = isCluster ? '_group.png' : '.png';
  const candidate = `${name.trim().toLowerCase().replace(/\s+/g, '_')}${suffix}`;
  return IconRegistry.has(candidate) ? candidate : (isCluster ? 'default_group.png' : 'default.png');
}

/**
 * Returns the glypth filename based on subcategory or fallback.
 *
 * @param name - Base name (subcategory or category).
 * @param isCluster - Whether this is a cluster icon.
 * @returns Icon filename (e.g. "tree.png").
 */
function getGlyphFilepath(name: string): string {
  const candidate = `${name.trim().toLowerCase().replace(/\s+/g, '_')}_g.png`;
  return GlyphRegistry.has(candidate) ? candidate : 'default.png';
}

/**
 * Returns the 3D model filename based on subcategory or fallback.
 *
 * @param name - Base name (subcategory or category).
 * @param isCluster - Whether this is a cluster icon.
 * @returns 3D model filename (e.g. "tree.gltf").
 */
function getModelFilepath(name: string): string {
  const candidate = `${name.trim().toLowerCase().replace(/\s+/g, '_')}`;
  return ModelRegistry.has(candidate) ? candidate : 'default.gltf';
}

function getIcon3DFilepath(name: string, isCluster: boolean): string {
  const suffix = isCluster ? '_group' : '';
  const candidate = `${name.trim().toLowerCase().replace(/\s+/g, '_')}_3d${suffix}.png`;
  return IconRegistry.has(candidate) ? candidate : (isCluster ? 'default_3d_group.png' : 'default_3d.png');
}

/**
 * Returns a grammatically correct label for a cluster:
 * - “Tree”    when count === 1
 * - “2 Trees” when count > 1
 */
function getClusterLabel(subcategory: string, count: number): string {
  if (count === 1) {
    return subcategory;
  }
  return `${count} ${subcategory}s`;
}

/**
 * Computes the great‐circle distance in meters between two lat/lon points using the Haversine formula.
 */
export function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6_378_137; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Converts degrees to radians. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

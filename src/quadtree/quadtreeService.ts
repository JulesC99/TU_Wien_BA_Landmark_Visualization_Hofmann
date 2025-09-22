import type { QuadtreeNode, QuadtreeFeature } from './types';
import type { CategorySelection } from './types';
import { buildFeaturesAtDepth, countPoisInCircle, bboxIntersectsCircle, buildDetailFeaturesAtDepth } from './quadtreeTraversal';
import { chunkBBox, chunksForViewport, addNeighbourRing } from './bboxUtils';

// Represents a map viewport bounding box.
export type Viewport = { south: number; west: number; north: number; east: number };

// Maximum number of quadtree chunks to keep in the in‐memory LRU cache.
const MAX_CACHED_CHUNKS = 64;

/**
 * Formats a chunk’s JSON filename from its numeric ID.
 * 
 * @param chunkId - The chunk ID (0–15).
 * @returns Filename like "quadtree_5.json".
 */
function formatChunkFileName(chunkId: number): string {
  return `quadtree_${chunkId}.json`;
}

/**
 * Builds the folder name for a (category, subcategory) pair.
 * Spaces are replaced with underscores.
 */
function formatFolderName(category: string, subcat: string): string {
  return `${category.replace(/\s+/g, '_')}_${subcat.replace(/\s+/g, '_')}`;
}

// In‐memory LRU cache 
const cache = new Map<string, QuadtreeNode>();
// Tracks in‐flight fetch requests so stale ones can be aborted.
const inFlight = new Map<string, AbortController>();
// Remembers which neighbor chunks have been already prefetched.
let prefetched = new Set<string>();

/**
 * Inserts a node into the LRU cache under the given key.
 * Evicts the oldest entry if the cache exceeds its capacity.
 */
function cacheChunk(key: string, node: QuadtreeNode): void {
  cache.delete(key);
  cache.set(key, node);
  if (cache.size > MAX_CACHED_CHUNKS) {
    const oldestKey = cache.keys().next().value!;
    cache.delete(oldestKey);
  }
}

/**
 * Constructs an “empty” quadtree node for a chunk that has no data.
 * 
 * @param chunkId - The chunk ID whose bbox will be used.
 */
function makeEmptyNode(chunkId: number): QuadtreeNode {
  return {
    bbox: chunkBBox(chunkId),
    data: [],
    children: [],
    poiCount: 0,
    averagePosition: null,
    leafCount: 0
  } as QuadtreeNode;
}

/**
 * Fetches a quadtree chunk JSON, with abort and caching support. On any HTTP or parse error, returns an empty node instead of throwing.
 *
 * @param category - Top‐level category name.
 * @param subcat - Subcategory name.
 * @param chunkId - Numeric chunk ID (0–15).
 * @returns The fetched or empty QuadtreeNode.
 */
async function fetchChunk(
  category: string,
  subcat: string,
  chunkId: number
): Promise<QuadtreeNode> {
  const key = `${category}__${subcat}__${chunkId}`;

  // Cache hit
  if (cache.has(key)) return cache.get(key)!;

  // Cancel prior request for same key
  inFlight.get(key)?.abort();
  const controller = new AbortController();
  inFlight.set(key, controller);

  const url = `/data/quadtrees/${formatFolderName(category, subcat)}/${formatChunkFileName(chunkId)}`;

  // Keep DRY
  const emptyAndCache = (): QuadtreeNode => {
    const node = makeEmptyNode(chunkId);
    cacheChunk(key, node);
    return node;
  };

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      // 404 is an expected hole → no warning
      if (res.status !== 404) {
        console.warn(`[fetchChunk] HTTP ${res.status} for ${key} → empty`);
      }
      return emptyAndCache();
    }

    // Only parse if it's JSON (some servers return HTML with 200)
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return emptyAndCache();
    }

    const node = (await res.json()) as QuadtreeNode;
    cacheChunk(key, node);
    return node;

  } catch (err: any) {
    // Abort is expected when we cancel stale requests — be quiet and don't cache
    if (err?.name === 'AbortError' ||
      (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')) {
      return makeEmptyNode(chunkId);
    }

    // Other network errors → log once, return empty + cache
    // console.warn(`[fetchChunk] network error for ${key} → empty`, err);
    return emptyAndCache();

  } finally {
    inFlight.delete(key);
  }
}

/**
 * Ensures that all quadtree chunks covering the current viewport (plus their immediate neighbours) are fetched and cached.
 *
 * @param selection - Map of category -> subcategory[].
 * @param viewport - Current map viewport bbox.
 */
export async function ensureTilesForViewport(
  selection: CategorySelection,
  viewport: Viewport
): Promise<void> {
  // Which chunks intersect the viewport?
  const visibleSet = new Set(chunksForViewport(viewport));
  // Also prefetch their direct neighbours
  const loadSet = addNeighbourRing(visibleSet);

  // Abort any stale in-flight requests not in loadSet
  inFlight.forEach((_ctrl, key) => {
    const idStr = `__${[...loadSet].find(i => key.endsWith(`__${i}`))}`;
    if (!idStr) {
      inFlight.get(key)!.abort();
      inFlight.delete(key);
    }
  });

  // Fetch visible chunks immediately (blocking)
  const visibleTasks = selectionEntries(selection).flatMap(({ cat, sub }) =>
    [...visibleSet].map(id => fetchChunk(cat, sub, id))
  );
  await Promise.all(visibleTasks);

  // Prefetch neighbours once, in the background
  selectionEntries(selection).flatMap(({ cat, sub }) =>
    [...loadSet]
      .filter(id => !visibleSet.has(id))
      .map(id => ({ cat, sub, id }))
  ).forEach(({ cat, sub, id }) => {
    const key = `${cat}__${sub}__${id}`;
    if (!prefetched.has(key)) {
      prefetched.add(key);
      fetchChunk(cat, sub, id).catch(() => { });
    }
  });
}

/**
 * Builds all POI features (clusters and details) at a given quadtree depth for the current viewport and selected categories.
 *
 * @param selection - Map of category → subcategory[].
 * @param depth - Target quadtree depth (1–6).
 * @param viewport - Current map viewport bbox.
 * @returns Array of GeoJSON features ready for rendering.
 */
export async function getAllFeaturesForSelection(
  selection: CategorySelection,
  depth: number,
  viewport: Viewport
): Promise<QuadtreeFeature[]> {
  await ensureTilesForViewport(selection, viewport);

  const visibleIds = chunksForViewport(viewport);
  const features: QuadtreeFeature[] = [];

  for (const { cat, sub } of selectionEntries(selection)) {
    for (const id of visibleIds) {
      const node = await fetchChunk(cat, sub, id);
      features.push(...buildFeaturesAtDepth(node, depth, cat, sub));
    }
  }

  // Log total feature & POI counts
  const totalFeatures = features.length;
  const totalPois = features.reduce<number>((sum, f) => {
    return sum + (f.properties.type === 'cluster' ? (f.properties.count ?? 0) : 1);
  }, 0);
  console.log(`[getAllFeaturesForSelection] features=${totalFeatures}, totalPOIs=${totalPois}`);

  return features;
}

/**
 * Builds detail features only at a given quadtree depth for the current viewport and selected categories.
 *
 * @param selection - Map of category → subcategory[].
 * @param depth - Target quadtree depth (1–6).
 * @param viewport - Current map viewport bbox.
 * @returns Array of GeoJSON features ready for rendering.
 */
export async function getDetailFeaturesForSelection(
  selection: CategorySelection,
  depth: number,
  viewport: Viewport
): Promise<QuadtreeFeature[]> {
  await ensureTilesForViewport(selection, viewport);

  const visibleIds = chunksForViewport(viewport);
  const features: QuadtreeFeature[] = [];

  for (const { cat, sub } of selectionEntries(selection)) {
    for (const id of visibleIds) {
      const node = await fetchChunk(cat, sub, id);
      features.push(...buildDetailFeaturesAtDepth(node, depth, cat, sub));
    }
  }
  return features;
}

/**
 * Counts how many POIs lie within a given circle for each category/subcategory.
 *
 * @param selection - Map of category → subcategory[].
 * @param centerLat - Circle center latitude.
 * @param centerLon - Circle center longitude.
 * @param radiusM - Radius in meters.
 * @returns Nested result object: { [category]: { [subcat]: count } }.
 */
export async function getPoiCountsForSelection(
  selection: CategorySelection,
  centerLat: number,
  centerLon: number,
  radiusM: number
): Promise<Record<string, Record<string, number>>> {
  const result: Record<string, Record<string, number>> = {};

  // Pre-filter chunks that could intersect the circle
  const candidateIds = new Set(
    Array.from({ length: 16 }, (_, i) => i)
      .filter(i => bboxIntersectsCircle(chunkBBox(i), centerLat, centerLon, radiusM))
  );

  for (const { cat, sub } of selectionEntries(selection)) {
    let sum = 0;
    for (const id of candidateIds) {
      const node = await fetchChunk(cat, sub, id);
      sum += countPoisInCircle(node, centerLat, centerLon, radiusM);
    }
    result[cat] = result[cat] || {};
    result[cat][sub] = sum;
  }

  return result;
}

/**
 * Convenience wrapper to get the total POI count for a flat list of (category, subcategory) pairs.
 *
 * @param pairs - Array of objects `{ cat, sub }`.
 * @param centerLat - Circle center latitude.
 * @param centerLon - Circle center longitude.
 * @param radiusM - Radius in meters.
 * @returns Total POI count across all specified pairs.
 */
export async function getPoiCountAroundPosition(
  pairs: { cat: string; sub: string }[],
  centerLat: number,
  centerLon: number,
  radiusM: number
): Promise<number> {
  const selection: CategorySelection = {};
  for (const { cat, sub } of pairs) {
    selection[cat] = (selection[cat] || []).concat(sub);
  }
  const counts = await getPoiCountsForSelection(selection, centerLat, centerLon, radiusM);
  return Object.values(counts)
    .flatMap(Object.values)
    .reduce((sum, v) => sum + v, 0);
}

/**
 * Flattens `CategorySelection` (map of category→subcat[]) into a list of `{cat, sub}` entries.
 */
function selectionEntries(sel: CategorySelection): Array<{ cat: string; sub: string }> {
  return Object.entries(sel).flatMap(([cat, subs]) =>
    subs.map(sub => ({ cat, sub }))
  );
}

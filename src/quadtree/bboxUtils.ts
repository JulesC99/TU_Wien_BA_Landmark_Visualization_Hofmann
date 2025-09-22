/**
 * Geographic bounding box defined by its southern, western, northern, and eastern edges.
 */
export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** The overall bounding box for Austria. */
export const MASTER_BBOX: BBox = {
  south: 46.372652,
  west: 9.530952,
  north: 49.017078,
  east: 17.16058,
};

/** Number of rows/columns per side when subdividing the master bbox (4×4 = 16 chunks). */
export const GRID = 4;

/** Height of each row in degrees. */
export const LAT_STEP = (MASTER_BBOX.north - MASTER_BBOX.south) / GRID;

/** Width of each column in degrees. */
export const LON_STEP = (MASTER_BBOX.east - MASTER_BBOX.west) / GRID;

/**
 * Converts a row and column index (0–3) into a chunk ID (0–15).
 *
 * @param row - Row index (0 = southmost).
 * @param col - Column index (0 = westmost).
 * @returns The linear chunk ID.
 */
export function rowColToChunkId(row: number, col: number): number {
  return row * GRID + col;
}

/**
 * Determines which chunk a given latitude/longitude falls into.
 *
 * @param lat - Latitude to test.
 * @param lon - Longitude to test.
 * @returns The chunk ID (0–15), or null if outside the master bbox.
 */
export function chunkIdFromLatLon(
  lat: number,
  lon: number
): number | null {
  if (
    lat < MASTER_BBOX.south ||
    lat > MASTER_BBOX.north ||
    lon < MASTER_BBOX.west ||
    lon > MASTER_BBOX.east
  ) {
    return null;
  }
  const row = Math.floor((lat - MASTER_BBOX.south) / LAT_STEP);
  const col = Math.floor((lon - MASTER_BBOX.west) / LON_STEP);
  return rowColToChunkId(row, col);
}

/**
 * Given a set of chunk IDs, returns a new set that includes each original ID plus all of its eight surrounding neighbors.
 *
 * @param ids - A set of chunk IDs.
 * @returns A new set containing the original IDs and their neighbors.
 */
export function addNeighbourRing(ids: Set<number>): Set<number> {
  const result = new Set<number>(ids);
  ids.forEach(id => {
    const row = Math.floor(id / GRID);
    const col = id % GRID;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) {
          result.add(rowColToChunkId(nr, nc));
        }
      }
    }
  });
  return result;
}

/**
 * Splits a bounding box into four equal quadrants (SW, SE, NW, NE).
 *
 * @param box - The bbox to subdivide.
 * @returns An array of four sub–bboxes.
 */
export function subdivideIntoQuadrants(box: BBox): BBox[] {
  const midLat = (box.south + box.north) / 2;
  const midLon = (box.west + box.east) / 2;
  return [
    { south: box.south, west: box.west, north: midLat, east: midLon }, // SW
    { south: box.south, west: midLon, north: midLat, east: box.east }, // SE
    { south: midLat, west: box.west, north: box.north, east: midLon }, // NW
    { south: midLat, west: midLon, north: box.north, east: box.east }, // NE
  ];
}

/**
 * Precomputes the 16 chunk bboxes in row-major order by subdividing twice.
 */
export const CHUNK_BBOXES: BBox[] = subdivideIntoQuadrants(MASTER_BBOX)
  .flatMap(quadrant => subdivideIntoQuadrants(quadrant));

/**
 * Retrieves the bounding box for a given chunk ID.
 *
 * @param id - Chunk ID (0–15).
 * @returns The corresponding BBox.
 */
export function chunkBBox(id: number): BBox {
  return CHUNK_BBOXES[id];
}

/**
 * Returns a list of chunk IDs whose bboxes intersect the given viewport.
 *
 * @param view - The viewport bbox to test.
 * @returns An array of chunk IDs that overlap the view.
 */
export function chunksForViewport(view: BBox): number[] {
  return CHUNK_BBOXES
    .map((bbox, idx) => ({ bbox, idx }))
    .filter(({ bbox }) =>
      !(view.east < bbox.west ||
        view.west > bbox.east ||
        view.north < bbox.south ||
        view.south > bbox.north)
    )
    .map(({ idx }) => idx);
}

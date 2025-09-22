import type { Feature, Point } from 'geojson';

/**
 * Tuple representing a geographic bounding box: [south, west, north, east].
 */
export type BBox = [south: number, west: number, north: number, east: number];

/**
 * Map of category names to arrays of selected subcategory names. Used to request quadtree data for multiple subcategories.
 */
export interface CategorySelection {
  [category: string]: string[];
}

/**
 * Properties attached to each Quadtree Feature on the frontend.
 *
 * - `type`: 'cluster' (aggregated node) or 'detail' (individual POI).
 * - `iconName`: filename of the icon to display.
 * - `glyphName`: filename of the glyph to display.
 * - `modelName`: filename of the 3D model to display.
 * - `category`, `subcat`: classification labels.
 * - `count`: number of POIs (only present on clusters).
 * - `label`: text label for clusters or POI names.
 */
export interface QuadtreeProps {
  type: 'cluster' | 'detail';
  iconName: string;
  glyphName: string;
  modelName: string;
  icon3DName: string;
  category: string;
  subcat: string;
  count?: number;
  label: string;
  [key: string]: any;
}

/**
 * GeoJSON Feature with Point geometry and QuadtreeProps. These are the objects rendered on the map layers.
 */
export type QuadtreeFeature = Feature<Point, QuadtreeProps>;

/**
 * Represents a node in the quadtree, as emitted by the backend.
 *
 * - `bbox`: node’s geographic extent.
 * - `poiCount`: total POIs under this node.
 * - `leafCount`: count of POIs at this node if it’s a leaf.
 * - `averagePosition`: centroid of contained POIs ([lng, lat]).
 * - `data`: raw POIs if leaf, otherwise empty.
 * - `children`: subdivided nodes if internal, otherwise empty.
 */
export interface QuadtreeNode {
  bbox: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  poiCount: number;
  leafCount: number;
  averagePosition: [number, number] | null;
  data: Feature<Point>[];
  children: QuadtreeNode[];
}

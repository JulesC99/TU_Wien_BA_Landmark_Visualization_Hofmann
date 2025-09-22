import type { Feature, FeatureCollection, Point } from 'geojson';
import { LAYER_IDS, SOURCE_ID } from './layerIds';
import { ModelRegistry } from './assetRegistry';
import * as THREE from 'three';
import { set3DIconVisibility as set3DModel2DIconVisibility } from './3DIconLayer';

// ------- Distance Threshholds -------
const LOD_RADIUS_3D = 200;  // spawn 3D within 100 m
const FLICKER_MARGIN = 20;    // extra margin to avoid flicker on removal
const MODEL_SCALE = 25;

declare global { interface Window { tb?: any; Threebox?: any; } }

type TBObject = any;
type FeatureId = string | number;

let _bootstrapped = false;
const _instances = new Map<FeatureId, TBObject>();

const DEBUG_3D = false;
const DBG = (...a: any[]) => { if (DEBUG_3D) console.debug('[3DLayer]', ...a); };
const WRN = (...a: any[]) => { if (DEBUG_3D) console.warn('[3DLayer]', ...a); };
const ERR = (...a: any[]) => { if (DEBUG_3D) console.error('[3DLayer]', ...a); };

export const custom3DLayer: any = {
  id: LAYER_IDS.model3D,
  type: 'custom',
  renderingMode: '3d',
  async onAdd(this: any, map: mapboxgl.Map) {
    await bootstrap(map);
  },
  render() {
    if (!window.tb) return;
    try {
      window.tb.update();
    } catch (e) {
      WRN('[3DLayer] tb.update() threw:', e);
    }
  },
};

/**
 * Removes all spawned 3D instances and clears related caches/state.
 *
 * This detaches any Three.js objects created by the 3D layer (models, anchors), and leaves the map style/layers intact. Intended for full resets or data swaps.
 *
 * @param map - The Mapbox GL map hosting the 3D layer.
 * @returns void
 */
export function clear3D(map: mapboxgl.Map) {
  for (const id of Array.from(_instances.keys())) despawn(map, id);
}

/**
 * Toggles the visibility of the entire 3D layer stack.
 *
 * Shows/hides all 3D instances in one call without destroying them, so they can be re-shown instantly without reloading models.
 *
 * @param map - The Mapbox GL map hosting the 3D layer.
 * @param visible - True to show, false to hide all 3D instances.
 * @returns void
 */
export function set3DLayerVisibility(map: mapboxgl.Map, visible: boolean): void {
  if (!visible) clear3D(map)
  set3DModel2DIconVisibility(map, visible)
  if (!map.getLayer(LAYER_IDS.model3D)) {
    WRN(`No 3D Layer found... returning early!`);
    return;
  }
  set3DModelVisibility(map, visible)
}

/**
 * Update the set of 3D features to render.
 * Accepts a FeatureCollection or an array of Features (Point).
 * This keeps 3D in sync with the latest feature set without touching the shared GeoJSON.
 */
export async function set3DLayerFeatures(
  map: mapboxgl.Map,
  features: FeatureCollection<Point, any> | Feature<Point, any>[]
): Promise<void> {
  if (!is3DVisible(map)) return;

  await bootstrap(map);

  const list: Feature<Point, any>[] = Array.isArray(features) ? features : (features?.features || []);
  const centerLL = [map.getCenter().lng, map.getCenter().lat] as [number, number];

  const keep = new Set<FeatureId>(); // only 3D instances stay here
  for (const f of list) {
    const id = toId(f);

    // 1) Update / Spawn / Despawn 3D
    addOrUpdateInstance(map, f, centerLL);

    // 2) 2D-Icon only on no 3D Version
    if (_instances.has(id)) {
      keep.add(id);
      setDetail2DState(map, id, false);
    } else if (f?.properties?.type === 'detail') {
      setDetail2DState(map, id, true);
    }
  }
  removeMissingInstances(keep, map);
}

function is3DVisible(map: mapboxgl.Map): boolean {
  const vis = map.getLayer(LAYER_IDS.model3D)
    ? (map.getLayoutProperty(LAYER_IDS.model3D, 'visibility') as string)
    : 'none';
  return vis === 'visible';
}

function ensureThreebox(map: mapboxgl.Map): any {
  if (window.tb) return window.tb;
  const ctor = (window as any).Threebox;
  if (!ctor) { ERR('window.Threebox not found.'); return null; }
  const gl = map.getCanvas().getContext('webgl');
  window.tb = new ctor(map, gl, { defaultLights: true });
  return window.tb;
}

async function bootstrap(map: mapboxgl.Map): Promise<void> {
  if (_bootstrapped) return;
  ensureThreebox(map);
  _bootstrapped = true;
  DBG('bootstrap successfull. Models:', Array.from(ModelRegistry.loadedModels.keys()));
}

function toId(f: Feature<Point, any>): FeatureId {
  const p = f.properties || {};
  return f.id ?? p.id ?? `${f.geometry?.coordinates?.join(',')}`;
}

function toLngLat(f: Feature<Point, any>): [number, number] | null {
  const c = f.geometry?.coordinates;
  if (!c || c.length < 2) return null;
  return [c[0], c[1]];
}

function addOrUpdateInstance(map: mapboxgl.Map, f: Feature<Point, any>, centerLL: [number, number]): void {
  const tb = ensureThreebox(map);
  if (!tb) return;

  const p = f.properties || {};
  const id = toId(f);
  const ll = toLngLat(f);
  if (!ll) { WRN(`Out of Bounds for LngLat!`); return; }

  // 1) clusters only 2D
  if (p.type === 'cluster') {
    if (_instances.has(id)) { try { tb.remove(_instances.get(id)); } catch { } _instances.delete(id); }
    return;
  }

  // 2) detail: decide by distance
  const dist = metersBetweenLL(ll, centerLL);
  const have3D = _instances.has(id);

  if (!have3D && dist <= LOD_RADIUS_3D) {
    const modelId = pickModelId(p);
    let base = ModelRegistry.get(modelId);
    if (!base) {
      WRN(`[3DLayer] model "${modelId}" not found in registry. Falling back to "default". props=`, p);
      base = ModelRegistry.get('default');
    }

    if (!base) { ERR('Default model not found'); return; }
    const clone = base.clone(true);

    const targetMeters = Number(p?.scaleMeters ?? MODEL_SCALE);
    const s = computeScale(clone, targetMeters);
    const initialScale = p?.scale
      ? { x: Number(p.scale.x ?? s), y: Number(p.scale.y ?? s), z: Number(p.scale.z ?? s) }
      : { x: s, y: s, z: s };

    const basisDeg = p?.basisDeg ?? { x: 90, y: -90, z: 0 };

    const tbObj = tb.Object3D({ obj: clone, units: 'meters', scale: initialScale, rotation: basisDeg });
    tb.add(tbObj);
    _instances.set(id, tbObj);

    // altitude
    const hasAbs = Number.isFinite(p?.altitudeAbs);
    const hAG = Number(p?.altitude ?? 0);
    const groundZ = getGroundElevation(map, ll, true);
    const zAbs = hasAbs ? Number(p.altitudeAbs) : groundZ + hAG;
    try { tbObj.setCoords([ll[0], ll[1], zAbs]); } catch { }

    setDetail2DState(map, id, false);
    DBG('spawn 3D', id, 'dist=', Math.round(dist));

  } else if (have3D && dist > (LOD_RADIUS_3D + FLICKER_MARGIN)) {
    despawn(map, id);
    DBG('despawn 3D', id, 'dist=', Math.round(dist));
  }

  // if 3D exists, keep it positioned
  const inst = _instances.get(id);
  if (inst) {
    const hasAbs = Number.isFinite(p?.altitudeAbs);
    const hAG = Number(p?.altitude ?? 0);
    const groundZ = getGroundElevation(map, ll, true);
    const zAbs = hasAbs ? Number(p.altitudeAbs) : groundZ + hAG;
    try { inst.setCoords([ll[0], ll[1], zAbs]); } catch { }
  }
}

function iconNameToModelId(raw?: unknown): string {
  if (!raw) return 'default';
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/_group\.png$/i, '').replace(/\.png$/i, '');
  return s.replace(/\s+/g, '_');
}

function pickModelId(p: any): string {
  return iconNameToModelId(p?.modelName ?? p?.iconName ?? p?.subcategory ?? p?.category ?? 'default');
}

function despawn(map: mapboxgl.Map, id: FeatureId) {
  const tb = ensureThreebox(map);
  const inst = _instances.get(id) as TBObject | undefined;
  if (!tb || !inst) return;

  // remove main object
  try { tb.remove(inst); } catch { }

  // dispose THREE
  if (inst.__root) {
    disposeThree(inst.__root);
    inst.__root = undefined;
  }

  _instances.delete(id);
  setDetail2DState(map, id, true);
  DBG('despawned', id);
}

function disposeThree(root: THREE.Object3D) {
  root.traverse((o: any) => {
    if (o.isMesh) {
      if (o.geometry?.dispose) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m?.dispose?.();
    }
  });
}

function computeScale(obj: THREE.Object3D, targetSize = 10): number {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let has = false;

  obj.traverse((o: any) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry as THREE.BufferGeometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox) return;
    const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
    if (!has) { box.copy(bb); has = true; } else { box.union(bb); }
  });

  if (!has) return 1;
  const size = new THREE.Vector3(); box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  return maxDim > 0 ? (targetSize / maxDim) : 1;
}

function getGroundElevation(map: mapboxgl.Map, ll: [number, number], exaggerated = true): number {
  try { return map.queryTerrainElevation({ lng: ll[0], lat: ll[1] }, { exaggerated }) ?? 0; }
  catch { return 0; }
}

function set3DModelVisibility(map: mapboxgl.Map, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none';
  map.setLayoutProperty(LAYER_IDS.model3D, 'visibility', visibility);
}

//------------------------Render logic --------------------------------

function setDetail2DState(map: mapboxgl.Map, id: FeatureId, show: boolean) {
  try {
    const cur = map.getFeatureState({ source: SOURCE_ID, id })?.show2D;
    if (cur !== show) map.setFeatureState({ source: SOURCE_ID, id }, { show2D: show });
  } catch {
    DBG(`ID ${id} missing in ${SOURCE_ID}`);
  }
}

function metersBetweenLL(a: [number, number], b: [number, number]): number {
  const R = 6_378_137; // WGS84 radius in meters
  const toRad = (d: number) => d * Math.PI / 180;

  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}


function removeMissingInstances(keep: Set<FeatureId>, map: mapboxgl.Map): void {
  const tb = ensureThreebox(map);
  if (!tb) return;
  for (const [id] of Array.from(_instances.entries())) {
    if (!keep.has(id)) despawn(map, id);
  }
}
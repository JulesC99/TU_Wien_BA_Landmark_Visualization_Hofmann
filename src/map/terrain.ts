let _terrainHQEnabled = true;
let _map: mapboxgl.Map | null = null;

export function getTerrainFlag(): boolean {
  return _terrainHQEnabled;
}

export function setTerrainFlag(flag: boolean): void {
  if (_map == null) {
    console.warn('[terrain] setTerrainFlag called before initTerrain(map)');
    return;
  }
  if (_terrainHQEnabled === flag) return;

  _terrainHQEnabled = flag;
  swapTerrain(_map, _terrainHQEnabled);
  try { colorTerrainBackground(_map, _terrainHQEnabled); } catch {}
}

export function initTerrain(map: mapboxgl.Map) {
  _map = map;
}

export function setupTerrain(map: mapboxgl.Map): void {
  initTerrain(map);
  swapTerrain(map, _terrainHQEnabled);
  colorTerrainBackground(map, _terrainHQEnabled);
}

/* --------------------- internals --------------------- */

function removeIfPresent(map: mapboxgl.Map, id: string) {
  // Terrain must be detached before removing a source used by terrain
  const t = (map as any).getTerrain && (map as any).getTerrain();
  if (t && t.source === id) (map as any).setTerrain(null);
  if (map.getSource(id)) {
    try { map.removeSource(id); } catch {}
  }
}

function swapTerrain(map: mapboxgl.Map, highQuality: boolean) {
  // 1) Always detach current terrain and remove both sources (hard swap)
  (map as any).setTerrain(null);
  removeIfPresent(map, 'terrain-dem');
  removeIfPresent(map, 'mapbox-dem');

  // 2) Add the target source and set terrain
  if (highQuality) {
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: [
        'https://alpinemaps.cg.tuwien.ac.at/tiles/mapbox_terrain_rgb/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      maxzoom: 20,
      minzoom: 6,
    } as any);
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.2 } as any);
  } else {
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 20,
      minzoom: 6,
    } as any);
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 } as any);
  }
}

/** background/fog styling (unchanged) */
function colorTerrainBackground(map: mapboxgl.Map, useUni: boolean): void {
  const style = map.getStyle();
  const bg = style.layers.find(l => l.type === 'background');

  const bgColor = useUni ? '#5a6b57' : '#6a5a57';

  if (!bg) {
    map.addLayer(
      { id: 'background', type: 'background', paint: { 'background-color': bgColor } },
      style.layers[0]?.id
    );
  } else {
    map.setPaintProperty(bg.id, 'background-color', bgColor);
  }

  map.setFog({
    color: useUni ? '#6b7a6a' : '#6a6b7a',
    'horizon-blend': 0.4,
    'high-color': useUni ? '#93a18f' : '#8fa1a3',
    'space-color': useUni ? '#6b7a6a' : '#6a6b7a',
  } as any);
}
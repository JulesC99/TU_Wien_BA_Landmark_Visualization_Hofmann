import { LAYER_IDS, SOURCE_ID } from './layerIds';

export function addGlyphClusterLayer(map: mapboxgl.Map): void {
  map.addLayer({
    id: LAYER_IDS.glyphCluster,
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

export function addGlyphDetailLayer(map: mapboxgl.Map): void {
  map.addLayer({
    id: LAYER_IDS.glyphDetail,
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

export function setGlyphVisibility(map: mapboxgl.Map, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none';
  map.setLayoutProperty(LAYER_IDS.glyphCluster, 'visibility', visibility);
  map.setLayoutProperty(LAYER_IDS.glyphDetail, 'visibility', visibility);
}

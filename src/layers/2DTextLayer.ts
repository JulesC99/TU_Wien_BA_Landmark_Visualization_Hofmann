import { LAYER_IDS, SOURCE_ID } from './layerIds';

export function addTextClusterLayer(map: mapboxgl.Map): void {
  map.addLayer({
    id: LAYER_IDS.textCluster,
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

export function addTextDetailLayer(map: mapboxgl.Map): void {
  map.addLayer({
    id: LAYER_IDS.textDetail,
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

export function setTextVisibility(map: mapboxgl.Map, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none';
  map.setLayoutProperty(LAYER_IDS.textCluster, 'visibility', visibility);
  map.setLayoutProperty(LAYER_IDS.textDetail, 'visibility', visibility);
}

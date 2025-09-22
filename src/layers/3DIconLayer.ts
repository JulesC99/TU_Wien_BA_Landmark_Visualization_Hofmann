import { LAYER_IDS, SOURCE_ID } from './layerIds';

export function add3DIconClusterLayer(map: mapboxgl.Map): void {
  map.addLayer({
    id: LAYER_IDS.model3DCluster2D,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['==', ['get', 'type'], 'cluster'],
    layout: {
      'icon-image': ['get', 'icon3DName'],
      'icon-size': 0.1,
      'icon-allow-overlap': false,
      'visibility': 'none'
    },
  });
}

export function add3DIconDetailLayer(map: mapboxgl.Map): void {
  map.addLayer({
    id: LAYER_IDS.model3DDetail2D,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['==', ['get', 'type'], 'detail'],
    layout: {
      'icon-image': ['get', 'icon3DName'],
      'icon-size': 0.1,
      'icon-allow-overlap': false,
      'visibility': 'none'
    },
    paint: {
      'icon-opacity': [
        'case',
        ['boolean', ['feature-state', 'show2D'], true],
        1, 0
      ],
    },
  });
}

export function set3DIconVisibility(map: mapboxgl.Map, visible: boolean): void {
  const ids = [LAYER_IDS.model3DCluster2D, LAYER_IDS.model3DDetail2D];
  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
    else
      console.error(`Failed to set Layer Visibility: ${id} to ${visible}`);
  }
}

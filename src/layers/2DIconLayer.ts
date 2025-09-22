import { LAYER_IDS, SOURCE_ID } from './layerIds';

export function addIconClusterLayer(map: mapboxgl.Map): void {
  map.addLayer({
    id: LAYER_IDS.iconCluster,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['==', ['get', 'type'], 'cluster'],
    layout: {
      'icon-image': ['get', 'iconName'],
      'icon-size': 0.15,
      'icon-allow-overlap': false,
      'visibility': 'none'
    },
  });
}

export function addIconDetailLayer(map: mapboxgl.Map): void {
  map.addLayer({
    id: LAYER_IDS.iconDetail,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['==', ['get', 'type'], 'detail'],
    layout: {
      'icon-image': ['get', 'iconName'],
      'icon-size': 0.15,
      'icon-allow-overlap': false,
      'visibility': 'none'
    },
  });
}

export function setIconVisibility(map: mapboxgl.Map, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none';
  map.setLayoutProperty(LAYER_IDS.iconCluster, 'visibility', visibility);
  map.setLayoutProperty(LAYER_IDS.iconDetail, 'visibility', visibility);
}

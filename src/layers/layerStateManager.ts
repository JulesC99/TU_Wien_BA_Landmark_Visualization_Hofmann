import mapboxgl, { Map } from 'mapbox-gl';
import type { FeatureCollection, Point, GeoJsonProperties, Feature } from 'geojson';
import type { QuadtreeFeature, QuadtreeProps } from '../quadtree/types';
import { buildPoIInfoHTML, enablePoIPanelToggle } from '../ui/poiInfoPanel';
import { LAYER_IDS, SOURCE_ID } from './layerIds';
import { addIconClusterLayer, addIconDetailLayer, setIconVisibility } from './2DIconLayer';
import { addGlyphClusterLayer, addGlyphDetailLayer, setGlyphVisibility } from './2DGlyphsLayer';
import { custom3DLayer, set3DLayerVisibility } from './3DLayer';
import { add3DIconClusterLayer, add3DIconDetailLayer } from './3DIconLayer';
import { addPolygonHeatmapLayer, setPolygonHeatmapVisibility } from './heatmap/polygonHeatmap';
import { addCategorizedHeatmapLayers, setCategorizedHeatmapCategories, setCategorizedHeatmapVisibility } from './heatmap/categorizedHeatmap';
import { addCircleHeatmapLayer, setCircleHeatmapVisibility } from './heatmap/circleHeatmap';
import { ensureCombined2DLayers, init2DLod, recompute2DLodNow, setCombinedVisibility } from './combined2DLayer';
import { addTextClusterLayer, addTextDetailLayer, setTextVisibility } from './2DTextLayer';


export const VisualizationModes = {
  icons: 'icons',
  text: 'text',
  glyph: 'glyph',
  threeD: '3d',
  heatmapCircle: 'heatmap-circle',
  heatmapCategorized: 'heatmap-categorized',
  heatmapPolygon: 'heatmap-polygon',
  combined: 'combined'
} as const;

export type VisualizationMode = typeof VisualizationModes[keyof typeof VisualizationModes];

let _activeHeatmapCats: string[] = [];

export function createPoiLayers(map: mapboxgl.Map): void {
  createSource(map);
  addAllPoiLayers(map)
  registerCursorStyle(map);
  registerClusterHoverPopups(map);
  registerDetailHoverPopups(map);
}

export function updatePoiData(map: mapboxgl.Map, features: QuadtreeFeature[]): void {
  const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) {
    console.error(`[poiRenderer] source "${SOURCE_ID}" not found`);
    return;
  }
  const data: FeatureCollection<Point, any> = {
    type: 'FeatureCollection',
    features: withStableIds(features as any) as any,
  };
  source.setData(data);
}

export function setPoiVisualizationMode(map: mapboxgl.Map, mode: VisualizationMode): void {
  resetLayerVisibilities(map);

  switch (mode) {
    case VisualizationModes.icons:
      setIconVisibility(map, true);
      break;

    case VisualizationModes.text:
      setTextVisibility(map, true);
      break;

    case VisualizationModes.glyph:
      setGlyphVisibility(map, true);
      break;

    case VisualizationModes.threeD:
      set3DLayerVisibility(map, true);
      break;

    case VisualizationModes.heatmapCircle:
      setCircleHeatmapVisibility(map, true);
      break;

    case VisualizationModes.heatmapCategorized:
      setCategorizedHeatmapVisibility(map, true);
      setCategorizedHeatmapCategories(map, _activeHeatmapCats);
      break;

    case VisualizationModes.heatmapPolygon:
      setPolygonHeatmapVisibility(map, true);
      break;

    case VisualizationModes.combined:
      setCombinedVisibility(map, true);

      map.once('idle', () => recompute2DLodNow(map));
      break;
  }
}

function createSource(map: mapboxgl.Map): void {
  if (map.getSource(SOURCE_ID)) return;
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] } as FeatureCollection<Point>,
    promoteId: 'id',
  });
}

function addAllPoiLayers(map: mapboxgl.Map) {
  // Icon
  addIconClusterLayer(map);
  addIconDetailLayer(map);

  // Text
  addTextClusterLayer(map);
  addTextDetailLayer(map);

  // Glyph
  addGlyphClusterLayer(map);
  addGlyphDetailLayer(map);

  // Heatmaps
  addCircleHeatmapLayer(map);
  addCategorizedHeatmapLayers(map);
  addPolygonHeatmapLayer(map);

  // 3D
  map.addLayer(custom3DLayer);
  add3DIconClusterLayer(map);
  add3DIconDetailLayer(map);

  // Combined 2D Layer
  ensureCombined2DLayers(map);
  init2DLod(map);
  setCombinedRenderOrder(map);

  enablePoIPanelToggle(map.getContainer());
}

function withStableIds(features: Feature<Point, any>[]): Feature<Point, any>[] {
  let seq = 0;
  return features.map((f) => {
    const raw =
      (f.id as any) ??
      f.properties?.id ??
      `${f.geometry?.coordinates?.join(',')}-${seq++}`;

    const id = String(raw);           // <-- normalize once
    (f as any).id = id;               // top-level id
    (f.properties ||= {}).id = id;    // properties.id (for promoteId & filters)
    return f;
  });
}

function setCombinedRenderOrder(map: mapboxgl.Map): void {
  try {
    // Combined clusters: text above icons, icons above glyphs
    map.moveLayer(LAYER_IDS.combinedTextCluster, LAYER_IDS.combinedIconCluster);
    map.moveLayer(LAYER_IDS.combinedIconCluster, LAYER_IDS.combinedGlyphCluster);

    // Combined details: text above icons, icons above glyphs
    map.moveLayer(LAYER_IDS.combinedTextDetail, LAYER_IDS.combinedIconDetail);
    map.moveLayer(LAYER_IDS.combinedIconDetail, LAYER_IDS.combinedGlyphDetail);
  } catch (e) {
    console.warn('[lod2d] combined moveLayer order tweak failed', e);
  }
}

function resetLayerVisibilities(map: mapboxgl.Map): void {
  setIconVisibility(map, false);
  setTextVisibility(map, false);
  setGlyphVisibility(map, false);
  setCircleHeatmapVisibility(map, false);
  setCategorizedHeatmapVisibility(map, false);
  setPolygonHeatmapVisibility(map, false);
  set3DLayerVisibility(map, false);
  setCombinedVisibility(map, false);
}

/** Hover / click UX for clusters */
function registerClusterHoverPopups(map: mapboxgl.Map): void {
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: { top: [0, 15], bottom: [0, -15] },
  });

  const clusterLayers = [
    // non-combined
    LAYER_IDS.iconCluster, LAYER_IDS.textCluster, LAYER_IDS.glyphCluster,
    // combined
    LAYER_IDS.combinedIconCluster, LAYER_IDS.combinedTextCluster, LAYER_IDS.combinedGlyphCluster,
  ];

  clusterLayers.forEach((layerId) => {
    map.on('mouseenter', layerId, (e) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const coords = (feat.geometry as any).coordinates as [number, number];
      const props = feat.properties as QuadtreeProps;

      const header = props.label;
      const itemWord = props.count === 1 ? 'item' : 'items';
      const html = `
        <div style="font-size: 14px; line-height: 1.4; padding: 10px;">
          <div style="font-weight: 600;">${header}</div>
          <div>${props.count} ${itemWord}</div>
        </div>
      `;

      popup.setLngLat(coords).setHTML(html).addTo(map);
    });

    map.on('mouseleave', layerId, () => popup.remove());
  });

  // Click to zoom in on clusters
  [LAYER_IDS.iconCluster, LAYER_IDS.textCluster].forEach((layerId) => {
    map.on('click', layerId, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const coords = (feature.geometry as any).coordinates as [number, number];
      map.easeTo({ center: coords, zoom: Math.min(map.getZoom() + 1, 18) });
    });
  });
}

/** Hover / click UX for detail features */
function registerDetailHoverPopups(map: mapboxgl.Map): void {
  let hoverPopup: mapboxgl.Popup | null = null;
  let activePopup: mapboxgl.Popup | null = null;

  const detailLayers = [
    // non-combined
    LAYER_IDS.iconDetail, LAYER_IDS.textDetail, LAYER_IDS.glyphDetail,
    // combined
    LAYER_IDS.combinedIconDetail, LAYER_IDS.combinedTextDetail, LAYER_IDS.combinedGlyphDetail,
  ];

  detailLayers.forEach((layerId) => {
    map.on('mouseenter', layerId, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const coords = (feature.geometry as any).coordinates as [number, number];
      const html = buildPoIInfoHTML(feature.properties as GeoJsonProperties);

      hoverPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: { top: [0, 15], bottom: [0, -15] },
      })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
    });

    map.on('mouseleave', layerId, () => {
      if (hoverPopup) {
        hoverPopup.remove();
        hoverPopup = null;
      }
    });

    map.on('click', layerId, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;

      if (activePopup) activePopup.remove();
      if (hoverPopup) {
        hoverPopup.remove();
        hoverPopup = null;
      }

      const coords = (feature.geometry as any).coordinates as [number, number];
      const html = buildPoIInfoHTML(feature.properties as GeoJsonProperties);

      activePopup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: { top: [0, 15], bottom: [0, -15] },
      })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);

      activePopup.on('close', () => {
        activePopup = null;
      });

      setTimeout(() => {
        const panel = document.querySelector('.poi-info-panel') as HTMLElement | null;
        const btn = panel?.querySelector('.poi-info-more-btn') as HTMLElement | null;
        const extra = panel?.querySelector('.additional-info') as HTMLElement | null;
        if (btn && extra) {
          btn.addEventListener('click', () => {
            extra.classList.toggle('hidden');
          });
        }
      }, 0);
    });
  });
}

function registerCursorStyle(map: mapboxgl.Map): void {
  const interactiveLayers = [
    // non-combined
    LAYER_IDS.iconCluster, LAYER_IDS.textCluster, LAYER_IDS.glyphCluster,
    LAYER_IDS.iconDetail, LAYER_IDS.textDetail, LAYER_IDS.glyphDetail,

    // combined
    LAYER_IDS.combinedIconCluster, LAYER_IDS.combinedTextCluster, LAYER_IDS.combinedGlyphCluster,
    LAYER_IDS.combinedIconDetail, LAYER_IDS.combinedTextDetail, LAYER_IDS.combinedGlyphDetail,
  ];

  const container = map.getCanvasContainer();

  const addHover = () => container.classList.add('is-hovering-poi');
  const removeHover = () => container.classList.remove('is-hovering-poi');

  interactiveLayers.forEach((layerId) => {
    map.on('mouseenter', layerId, addHover);
    map.on('mouseleave', layerId, removeHover);
  });
}
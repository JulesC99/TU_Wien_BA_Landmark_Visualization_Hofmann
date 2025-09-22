import mapboxgl from 'mapbox-gl';
import { createPoiLayers } from '../layers/layerStateManager';
import { custom3DLayer } from '../layers/3DLayer';
import { preloadAllGlyphs, preloadAll2DIcons, preloadAllModels, preloadAll3DIcons } from '../layers/assetLoader';
import { setupTerrain } from './terrain';
import { setMap, getCategoriesState } from './appState';
import { loadCategoryDefinitions, setupVisualizationToggle, setupCategoryUI } from './controls';
import { updateMapData } from './updateMapData';
import { setupQuickSelectionControls } from '../ui/quickselectionPanel';
import { LAYER_IDS } from '../layers/layerIds';
import { installLocationJumpControls } from './jumpButtonControls';
import { setupRadiusControl } from './radiusControls';

mapboxgl.accessToken = 'pk.eyJ1IjoianVsZXMxMjMxMjMiLCJhIjoiY200MDRqMTBnMXowMTJycjNqNHF6cnpqZCJ9.fo-1CjKL5p_DJKtIochLJQ';

export const IsTerrainActive = true; // control Terrain setup

/**
 * Initializes the Mapbox map, attaches controls, wires UI, and triggers first data load.
 * 
 * @returns The initialized Mapbox map instance.
 */
export async function initializeMap(): Promise<mapboxgl.Map> {
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/jules123123/cm623exvy006y01sgduk91x4p',
    center: [12.693973, 47.074411],
    zoom: 14,
    pitch: 50,
  });
  setMap(map);

  map.addControl(new mapboxgl.NavigationControl());

  map.on('load', async () => {
    if (IsTerrainActive) setupTerrain?.(map);

    // 1) UI wiring + category state
    await loadCategoryDefinitions();
    setupCategoryUI();
    setupQuickSelectionControls();
    setupRadiusControl();

    // 2) Preload assets (icons, glyphs, 3D models) up-front for a smooth first render
    const categories = getCategoriesState();
    await preloadAll2DIcons(map, categories);
    await preloadAllGlyphs(map, categories);
    await preloadAll3DIcons(map, categories);
    await preloadAllModels();

    // 3) Layers first
    createPoiLayers(map);
    if (!map.getLayer(LAYER_IDS.model3D)) {
      map.addLayer(custom3DLayer as any);
      console.debug('[init] Added custom layer:', LAYER_IDS.model3D);
    }

    // 4) 3D layer + viz toggle + quick presets
    setupVisualizationToggle();
    installLocationJumpControls(map);

    // 5) First data load
    await updateMapData();
  });
  map.on('zoomend', () => { void updateMapData(); });
  map.on('moveend', () => { void updateMapData(); });

  // Constrain camera pitch and minimum zoom
  map.transform.maxPitch = 65;
  map.transform.minPitch = 0;
  map.transform.minZoom = 6;

  return map;
}
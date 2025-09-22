import { showRadiusPreview, hideRadiusPreview } from "../layers/radiusPreview";
import { getBaseRadiusMeters, getEffectiveRadiusMeters, getMap, setBaseRadiusMeters, subscribeEffectiveRadius, subscribeRadius } from "./appState";
import { updateMapData } from "./updateMapData";

/**
 * Create and wire the radius slider control. Default: 2000 m at zoom = 14.
 */
export function setupRadiusControl(): void {
  const container = document.getElementById('radius-control');
  const slider = document.getElementById('radius-slider') as HTMLInputElement | null;
  const valueEl = document.getElementById('radius-value') as HTMLSpanElement | null;

  if (!container || !slider || !valueEl) {
    console.warn('[setupRadiusControl] Missing #radius-control or children.');
    return;
  }
  if ((container as any)._radiusBound) return;
  (container as any)._radiusBound = true;

  // sync label
  const render = () => { valueEl.textContent = String(getEffectiveRadiusMeters()); };

  subscribeRadius(() => {
    const b = getBaseRadiusMeters();
    if (parseInt(slider.value || '0', 10) !== b) slider.value = String(b);
    render();
  });

  subscribeEffectiveRadius(() => render());

  // inital sync
  slider.value = String(getBaseRadiusMeters());
  render();

  let previewActive = false;
  let updateTimer: number | null = null;

  const scheduleCountsRefresh = () => {
    if (updateTimer !== null) window.clearTimeout(updateTimer);
    updateTimer = window.setTimeout(() => {
      updateTimer = null;
      void updateMapData();
    }, 120);
  };

  slider.addEventListener('pointerdown', () => {
    const map = getMap();
    if (!map) return;
    previewActive = true;

    const center = map.getCenter();
    const base = parseInt(slider.value, 10) || getBaseRadiusMeters();
    const eff = effectiveRadiusFromZoom(base, map.getZoom());
    showRadiusPreview(center, eff);
  });

  slider.addEventListener('input', () => {
    const meters = parseInt(slider.value, 10);
    setBaseRadiusMeters(meters);

    // Update the preview circle
    if (previewActive) {
      const map = getMap();
      if (map) {
        const center = map.getCenter();
        const eff = effectiveRadiusFromZoom(meters, map.getZoom());
        showRadiusPreview(center, eff);
      }
    }

    scheduleCountsRefresh();
  });

  const endPreviewAndCommit = () => {
    if (!previewActive) return;
    previewActive = false;
    hideRadiusPreview();

    if (updateTimer !== null) {
      window.clearTimeout(updateTimer);
      updateTimer = null;
    }
    void updateMapData();
  };

  slider.addEventListener('pointerup', endPreviewAndCommit);
  slider.addEventListener('change', endPreviewAndCommit);
  slider.addEventListener('keyup', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') {
      previewActive = false;
      hideRadiusPreview();
    }
  });
}

function effectiveRadiusFromZoom(baseMeters: number, zoom: number): number {
  const scale = Math.pow(2, 14 - zoom);
  return Math.max(10, Math.round(baseMeters * scale));
}
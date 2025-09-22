export type LayerToggle = { id: string; label: string; active: boolean };

export type LayerSelectionMount = {
  update: (toggles: LayerToggle[]) => void;
  destroy: () => void;
};

export function mountLayerSelectionPanel(
  layersContainer: HTMLElement,
  toggles: LayerToggle[],
  onToggle: (id: string, active: boolean) => void
): LayerSelectionMount {
  const render = (ts: LayerToggle[]) => {
    layersContainer.innerHTML = `
      <div class="layer-toggles">
        ${ts.map(t => `
          <label class="layer-toggle">
            <input type="checkbox" data-layer="${t.id}" ${t.active ? 'checked' : ''}/>
            <span>${t.label}</span>
          </label>
        `).join('')}
      </div>
    `;
  };

  const onChange = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (el?.matches('input[type="checkbox"][data-layer]')) {
      onToggle(el.getAttribute('data-layer')!, el.checked);
    }
  };

  layersContainer.addEventListener('change', onChange);
  render(toggles);

  return {
    update(next) { render(next); },
    destroy() { layersContainer.removeEventListener('change', onChange); }
  };
}

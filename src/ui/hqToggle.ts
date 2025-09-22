import { getTerrainFlag, setTerrainFlag } from '../map/terrain';

export type HqToggleMount = {
  update: (enabled: boolean) => void;
  destroy: () => void;
};

export function bindHqToggleToDom(id = 'hq-toggle-control'): HqToggleMount {
  const node = document.getElementById(id) as HTMLInputElement | null;
  if (!node) {
    console.warn(`[hqToggle] #${id} not found`);
    return { update() {}, destroy() {} };
  }

  // initialize from terrain
  node.type = 'checkbox';
  node.checked = getTerrainFlag();

  const onChange = () => {
    const next = node.checked;
    console.debug('[hqToggle] change ->', next);
    setTerrainFlag(next);
  };

  node.addEventListener('change', onChange);

  return {
    update(enabled: boolean) { node.checked = enabled; },
    destroy() { node.removeEventListener('change', onChange); },
  };
}

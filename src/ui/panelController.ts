import { mountCategorySelectionPanel } from './categorySelectionPanel';
import { bindHqToggleToDom } from '../ui/hqToggle';

/**
 * Represents a single subcategory in the UI hierarchy.
 */
export interface Subcategory {
  /** Unique name of the subcategory. */
  name: string;
  /** Whether this subcategory is currently visible on the map. */
  visible: boolean;
  /** Optional count of POIs in this subcategory (for display). */
  count?: number;
}

/**
 * Represents a top-level category that can be folded/unfolded and contains one or more subcategories.
 */
export interface Category {
  /** Unique name of the category. */
  name: string;
  /** True if any of its subcategories is visible. */
  visible: boolean;
  /** True if its subcategory list is currently collapsed. */
  folded: boolean;
  /** List of subcategories under this category. */
  subcategories: Subcategory[];
}

/** Handler called when a category checkbox changes. */
export type ToggleCatFn = (category: Category, checked: boolean) => void;
/** Handler called when a subcategory checkbox changes. */
export type ToggleSubFn = (category: Category, sub: Subcategory, checked: boolean) => void;

type Opts = {
  sanitizeName?: (s: string) => string;
  terrainGet?: () => boolean;
  terrainSet?: (checked: boolean) => void;
  onClickHq?: () => void;
};

/**
 * Create the split UI.
 */
export function createPanelController(
  rootId: string,
  categories: Category[],
  onToggleCategory: ToggleCatFn,
  onToggleSubcategory: ToggleSubFn,
  opts?: Opts
) {
  const root = document.getElementById(rootId);
  if (!root) throw new Error(`[panelController] No element #${rootId}`);

  root.classList.add('hierarchy-container');
  root.innerHTML = '';
  const header = root.appendChild(Object.assign(document.createElement('div'), { className: 'hierarchy-header' }));
  const content = root.appendChild(Object.assign(document.createElement('div'), { className: 'category-content' }));
  const toolbar  = content.appendChild(Object.assign(document.createElement('div'), { className: 'category-toolbar' }));

  const sanitizeName = opts?.sanitizeName ?? ((s: string) => s.toLowerCase().replace(/\s+/g, '_'));

  let cats: Category[] = categories;
  let catById = new Map<string, Category>();
  let subByKey = new Map<string, { cat: Category; sub: Subcategory }>();

  const rebuildLookups = () => {
    catById = new Map(cats.map(c => [sanitizeName(c.name), c]));
    subByKey = new Map();
    for (const c of cats) {
      const catId = sanitizeName(c.name);
      for (const s of c.subcategories) {
        const subId = sanitizeName(s.name);
        subByKey.set(`${catId}:${subId}`, { cat: c, sub: s });
      }
    }
  };
  rebuildLookups();

  // Mount category panel
  const mount = mountCategorySelectionPanel(
    content,
    cats,
    sanitizeName,
    (catId, checked) => {
      const cat = catById.get(catId);
      if (cat) onToggleCategory(cat, checked);
    },
    (catId, subId, checked) => {
      const hit = subByKey.get(`${catId}:${subId}`);
      if (hit) onToggleSubcategory(hit.cat, hit.sub, checked);
    }
  );

  // Mount HQ toggle if callbacks provided
  const hq = bindHqToggleToDom();

  return {
    updateCategories(next: Category[]) {
      cats = next;
      rebuildLookups();
      mount.update(cats);
      if (hq && opts?.terrainGet) hq.update(opts.terrainGet());
    },
    destroy() {
      mount.destroy();
      if (hq) hq.destroy();
    }
  };
}


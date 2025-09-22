import type { Category, Subcategory } from './panelController';

const DEBUG = false;
const log = (...args: any[]) => { if (DEBUG) console.log(...args); };

export type CategorySelectionMount = {
  update: (categories: Category[]) => void;
  destroy: () => void;
};

/**
 * Pure renderer that reproduces the original DOM & behavior from categoryHierarchy.ts.
 * Renders directly into the given container.
 */
export function mountCategorySelectionPanel(
  container: HTMLElement,
  categories: Category[],
  sanitizeName: (s: string) => string,
  onToggleCategoryId: (categoryId: string, checked: boolean) => void,
  onToggleSubcategoryId: (categoryId: string, subId: string, checked: boolean) => void
): CategorySelectionMount {

  const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    init?: (node: HTMLElementTagNameMap[K]) => void
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (init) init(node);
    return node;
  };

  /** Active count of a subcategory when visible (0 if hidden) */
  const activeSubCount = (sub: Subcategory): number =>
    sub.visible ? Math.max(0, sub.count ?? 0) : 0;

  /** Sum of active counts of visible subcategories */
  const activeCategoryCount = (cat: Category): number =>
    cat.subcategories.reduce((sum, s) => sum + activeSubCount(s), 0);

  /** Compose a label like "Nature (239)" or just "Nature" when count is 0 */
  const withCount = (name: string, count: number): string =>
    count > 0 ? `${name} (${count})` : name;

  const categoryState = (cat: Category) => {
    const hasSubs = cat.subcategories.length > 0;
    const allVisible = hasSubs && cat.subcategories.every(s => s.visible);
    const someVisible = hasSubs && cat.subcategories.some(s => s.visible);
    return { hasSubs, allVisible, someVisible };
  };

  const renderSubItem = (cat: Category, sub: Subcategory): HTMLLIElement => {
    const li = element('li', 'subcategory-item');

    // Sub checkbox
    const checkbox = element('input') as HTMLInputElement;
    checkbox.type = 'checkbox';
    checkbox.checked = sub.visible;
    checkbox.onchange = () => {
      const checked = checkbox.checked;
      sub.visible = checked;
      cat.visible = cat.subcategories.some(s => s.visible);

      const subActive = activeSubCount(sub);
      const catActive = activeCategoryCount(cat);
      console.debug('[SubToggle]', {
        category: cat.name,
        subcategory: sub.name,
        checked,
        subCount: sub.count ?? 0,
        activeSubCount: subActive,
        activeCategoryCount: catActive
      });

      // Call original handler via controller (using IDs)
      onToggleSubcategoryId(sanitizeName(cat.name), sanitizeName(sub.name), checked);
      render();
    };
    li.appendChild(checkbox);

    // Sub label with active count
    const label = element('span', 'subcategory-label', span => {
      const count = activeSubCount(sub);
      span.textContent = withCount(sub.name, count);
      log('[SubLabel]', { sub: sub.name, visible: sub.visible, raw: sub.count ?? 0, activeCount: count });
    });
    li.appendChild(label);

    return li;
  };

  const renderCategoryItem = (cat: Category): HTMLLIElement => {
    const { hasSubs, allVisible, someVisible } = categoryState(cat);
    const li = element('li', 'category-item');

    const header = element('div', 'category-header');

    // Fold/unfold control
    const arrow = element('span', 'fold-arrow', span => {
      span.textContent = cat.folded ? '▶' : '▼';
      span.title = cat.folded ? 'Expand' : 'Collapse';
      span.onclick = () => {
        if (cat.subcategories.length > 0) {
          cat.folded = !cat.folded;
          log('[FoldToggle]', { category: cat.name, folded: cat.folded });
          render();
        }
      };
    });
    header.appendChild(arrow);

    // Category checkbox (with indeterminate)
    const checkbox = element('input') as HTMLInputElement;
    checkbox.type = 'checkbox';
    checkbox.checked = allVisible;
    checkbox.indeterminate = !allVisible && someVisible;
    checkbox.onchange = () => {
      const isChecked = checkbox.checked;
      cat.subcategories.forEach(s => (s.visible = isChecked));
      cat.folded = !isChecked;

      const catActive = activeCategoryCount(cat);
      log('[CategoryToggle]', {
        category: cat.name,
        checked: isChecked,
        activeCategoryCount: catActive,
        subStates: cat.subcategories.map(s => ({
          sub: s.name,
          visible: s.visible,
          count: s.count ?? 0,
          active: activeSubCount(s)
        }))
      });

      onToggleCategoryId(sanitizeName(cat.name), isChecked);
      render();
    };
    header.appendChild(checkbox);

    // Category label with active sum
    const label = element('span', 'category-label', span => {
      const count = activeCategoryCount(cat);
      span.textContent = withCount(cat.name, count);
      log('[CategoryLabel]', {
        category: cat.name,
        folded: cat.folded,
        allVisible,
        someVisible,
        activeCategoryCount: count
      });
    });
    header.appendChild(label);

    li.appendChild(header);

    // Sub-list
    if (!cat.folded && hasSubs) {
      const ul = element('ul', 'subcategory-list');
      for (const sub of cat.subcategories as Subcategory[]) {
        ul.appendChild(renderSubItem(cat, sub));
      }
      li.appendChild(ul);
    }

    return li;
  };

  function render() {
    // ---------- Root render ----------
    container.classList.add('hierarchy-container');
    container.innerHTML = '';

    const rootList = element('ul', 'category-list');
    const frag = document.createDocumentFragment();

    for (const cat of categories) {
      frag.appendChild(renderCategoryItem(cat));
    }

    rootList.appendChild(frag);
    container.appendChild(rootList);

    log('[RenderSnapshot]', categories.map(c => ({
      category: c.name,
      folded: c.folded,
      activeCategoryCount: activeCategoryCount(c),
      subs: c.subcategories.map(s => ({
        sub: s.name,
        visible: s.visible,
        count: s.count ?? 0,
        active: activeSubCount(s)
      }))
    })));
  }

  // initial render
  render();

  return {
    update(next: Category[]) {
      categories = next;
      render();
    },
    destroy() { }
  };
}

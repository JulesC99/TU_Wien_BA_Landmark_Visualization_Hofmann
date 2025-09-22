import { GeoJsonProperties } from 'geojson';

/**
 * Properties to exclude from the info panel.
 */
const EXCLUDE_KEYS = new Set<string>([
  'name',
  'category',
  'subcat',
  'id',
  'changeset',
  'source',
  'wikimedia_commons',
  'wikidata',
  'name:etymology:wikidata',
  'fixme',
  'source:position',
  'name:ru',
  'operator:wikidata',
  'iconName',
  'glyphName',
  'modelName',
  'label',
  'type',
  'amenity',
  'tourism',
  'natural',
  'osm_type'
]);


export function buildPoIInfoHTML(props: GeoJsonProperties): string {
  if (!props) {
    return `<div class="poi-info-empty"><em>No data available.</em></div>`;
  }

  const name = props.name ?? 'Unnamed';
  const category = props.category ?? 'N/A';
  const subcat = props.subcat ?? 'N/A';

  const importantRows: string[] = [
    makeRow('Category', `${category} – ${subcat}`),
  ];

  const address = buildAddress(props);
  if (address) {
    importantRows.push(makeRow('Address', address));
  }

  if (props.ele) {
    importantRows.push(makeRow('Elevation', `${props.ele} m`));
  }

  const additionalRows: string[] = [];
  Object.keys(props)
    .filter(key => !EXCLUDE_KEYS.has(key) && !key.startsWith('addr:') && key !== 'ele')
    .sort()
    .forEach(key => {
      const value = props[key];
      if (value == null || value === '') return;
      additionalRows.push(makeRow(formatLabel(key), String(value)));
    });

  const allRows = [...importantRows, ...additionalRows];

  if (allRows.length <= 5) {
    return `
      <div class="poi-info-panel">
        <h3 class="poi-info-header">${name}</h3>
        <table class="poi-info-table">
          <tbody class="main-info">
            ${allRows.join('\n')}
          </tbody>
        </table>
      </div>
    `;
  }

  const visibleRows = allRows.slice(0, 4);
  const hiddenRows = allRows.slice(4);
  const hiddenCount = hiddenRows.length;

  return `
  <div class="poi-info-panel has-more">
    <h3 class="poi-info-header">${name}</h3>
    <table class="poi-info-table">
      <tbody class="main-info">
        ${visibleRows.join('\n')}
      </tbody>
      <tbody class="additional-info hidden">
        ${hiddenRows.join('\n')}
      </tbody>
    </table>
    <button
      class="poi-info-more-btn"
      type="button"
      data-hidden-count="${hiddenCount}"
      aria-expanded="false"
    >
      Show ${hiddenCount} more
    </button>
  </div>
`;
}

export function enablePoIPanelToggle(root: HTMLElement | Document = document) {
  root.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    const btn = target?.closest?.('.poi-info-more-btn') as HTMLButtonElement | null;
    if (!btn) return;

    const panel = btn.closest('.poi-info-panel') as HTMLElement | null;
    const extra = panel?.querySelector('.additional-info') as HTMLElement | null;
    if (!panel || !extra) return;

    // how many rows to show in the collapsed label
    const countAttr = btn.getAttribute('data-hidden-count');
    const hiddenCount = countAttr ? Number(countAttr) : extra.querySelectorAll('tr').length;

    const willExpand = !panel.classList.contains('expanded');

    if (willExpand) {
      panel.classList.add('expanded');
      extra.classList.remove('hidden');
      btn.textContent = 'Close';
      btn.setAttribute('aria-expanded', 'true');
    } else {
      panel.classList.remove('expanded');
      extra.classList.add('hidden');
      btn.textContent = `Show ${hiddenCount} more`;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

/**
 * Constructs a single-line address from addr:* properties.
 *
 * @param props - GeoJSON properties containing address tags.
 * @returns A formatted address or an empty string if none.
 */
function buildAddress(props: GeoJsonProperties): string {
  const parts: string[] = [];

  if (props) {
    const street = props['addr:street'];
    const housenumber = props['addr:housenumber'];
    if (street || housenumber) {
      parts.push([street, housenumber].filter(Boolean).join(' '));
    }

    const postcode = props['addr:postcode'];
    const city = props['addr:city'];
    if (postcode || city) {
      parts.push([postcode, city].filter(Boolean).join(' '));
    }

    const country = props['addr:country'];
    if (country) {
      parts.push(country);
    }
  }

  return parts.join(', ');
}

/**
 * Creates an HTML table row for the info panel.
 *
 * @param label - The left-cell label.
 * @param value - The right-cell content.
 */
function makeRow(label: string, value: string): string {
  return `
    <tr>
      <td class="poi-info-label"><strong>${label}</strong></td>
      <td class="poi-info-value">${value}</td>
    </tr>
  `;
}

/**
 * Converts a raw key like "opening_hours" or "contact:phone"
 * into a human-friendly label (e.g. "Opening Hours", "Contact Phone").
 *
 * @param key - The raw property key.
 * @returns The formatted label.
 */
function formatLabel(key: string): string {
  return key
    .replace(/[:_\-]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

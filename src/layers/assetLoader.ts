import { GlyphRegistry, IconRegistry, ModelRegistry } from './assetRegistry';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Category } from '../ui/panelController';
import * as THREE from 'three';

const WRN = (...a: any[]) => console.warn(...a);

/* --------------------------- ICONS / GLYPHS --------------------------- */

/**
 * Preloads map icon images for all categories and their subcategories.
 *
 * For each category and subcategory name, attempts to load both the detail icon (`name.png`) and its cluster variant (`name_group.png`). 
 * Falls back silently if an icon file is missing.
 *
 * @param map - The Mapbox map instance to which images will be added.
 * @param categories - Array of category objects, each containing subcategories.
 */
export async function preloadAll2DIcons(
  map: mapboxgl.Map,
  categories: Category[]
): Promise<void> {
  return preloadIconsForCategory(map, '2DIcons', '', categories);
}

/**
 * Preloads map 3d icons for all categories and their subcategories.
 *
 * For each category and subcategory name, attempts to load both the detail icon (`name.png`) and its cluster variant (`name_group.png`). 
 * Falls back silently if an icon file is missing.
 *
 * @param map - The Mapbox map instance to which images will be added.
 * @param categories - Array of category objects, each containing subcategories.
 */
export async function preloadAll3DIcons(
  map: mapboxgl.Map,
  categories: Category[]
): Promise<void> {
  return preloadIconsForCategory(map, '3DIcons', '_3d', categories);
}

/**
 * Preloads map glyph images for all categories and their subcategories.
 *
 * For each category and subcategory name, attempts to load the glyph (`name.png`)
 * Falls back to default if an glyph file is missing.
 *
 * @param map - The Mapbox map instance to which images will be added.
 * @param categories - Array of category objects, each containing subcategories.
 */
export async function preloadAllGlyphs(
  map: mapboxgl.Map,
  categories: Category[]
): Promise<void> {
  for (const category of categories) {
    const baseId = sanitizeName(category.name);
    await tryLoadGlyph(map, `${baseId}_g.png`);

    for (const sub of category.subcategories) {
      const subId = sanitizeName(sub.name);
      await tryLoadGlyph(map, `${subId}_g.png`);
    }
  }

  await tryLoadGlyph(map, 'default_g.png');
}

/* ------------------------------ 3D MODELS ------------------------------- */

export interface GltfFolderOptions {
  /** Base URL that contains the .gltf, .bin, textures/, must end with '/' or will be fixed */
  baseUrl: string;
  /** glTF filename inside baseUrl (default: 'scene.gltf') */
  gltfName?: string;
  /** CORS mode; keep 'anonymous' unless same-origin */
  crossOrigin?: '' | 'anonymous';
  /** Throw if any dependent file fails to load (default: false) */
  strict?: boolean;
}

/**
 * Preloads all 3D models from `/assets/3DModels` and stores them in ModelRegistry.
 * 
 * @returns Promise<void>
 */
export async function preloadAllModels(): Promise<void> {
  const modelIds = await list3DModelFolders();
  await preloadDefaultModel();

  await Promise.all(modelIds.map(async (id) => {
    if (!id || id === 'default' || ModelRegistry.has(id)) return;
    try {
      await ModelRegistry.register(id, () =>
        loadGltfFromFolder({
          baseUrl: `/assets/3DModels/${id}/`,
          gltfName: 'scene.gltf',
          crossOrigin: 'anonymous',
          strict: false,
        })
      );
    } catch (err) {
      console.warn(`[models] Failed to preload "${id}"`, err);
    }
  }));
  console.debug('[models] loaded:', Array.from(ModelRegistry.loadedModels.keys()));
}

export interface GltfFolderOptions {
  baseUrl: string;
  gltfName?: string;              // default 'scene.gltf'
  crossOrigin?: '' | 'anonymous'; // default 'anonymous'
  strict?: boolean;               // default false
}

/**
 * Load a folder-based glTF (.gltf + .bin + textures) from a given base URL.
 * Uses setPath/resourcePath so relative assets resolve correctly.
 */
export async function loadGltfFromFolder(
  opts: GltfFolderOptions
): Promise<THREE.Object3D> {
  const baseUrl = opts.baseUrl.endsWith('/') ? opts.baseUrl : opts.baseUrl + '/';
  const gltfName = opts.gltfName ?? 'scene.gltf';
  const cross = opts.crossOrigin ?? 'anonymous';
  const strict = !!opts.strict;

  const manager = new THREE.LoadingManager();
  const missing: string[] = [];
  manager.onError = (url) => void missing.push(url);

  const loader = new GLTFLoader(manager);
  loader.setCrossOrigin(cross);
  loader.setPath(baseUrl);         // resolves .bin
  loader.setResourcePath(baseUrl); // resolves textures

  return new Promise((resolve, reject) => {
    loader.load(
      gltfName,
      (gltf) => {
        if (missing.length) {
          const msg = `[assetLoader] ${gltfName}: ${missing.length} dependent file(s) failed:\n` +
            missing.map((u) => `  - ${u}`).join('\n');
          if (strict) return reject(new Error(msg));
          console.warn(msg);
        }

        // sanity: at least one mesh with material
        let ok = false;
        gltf.scene.traverse((o: any) => {
          if (o.isMesh && (o.material || (Array.isArray(o.material) && o.material.length))) ok = true;
        });
        if (!ok) {
          console.warn(`[assetLoader] ${gltfName}: no mesh with material — model may be invisible.`);
        }

        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        const detail = (err && (String(err))) || 'Unknown error';
        reject(new Error(`[assetLoader] Failed to load ${baseUrl}${gltfName}: ${detail}`));
      }
    );
  });
}


export async function preloadDefaultModel(): Promise<void> {
  await ModelRegistry.register('default', () =>
    loadGltfFromFolder({
      baseUrl: '/assets/3DModels/default/',
      gltfName: 'scene.gltf',
      crossOrigin: 'anonymous',
      strict: false
    })
  );
}

/* ------------------------------- HELPERS -------------------------------- */

/**
 * Normalizes a human-readable name into a filename-safe ID.
 *
 * Trims whitespace, converts to lowercase, and replaces spaces with underscores.
 *
 * @param name - The raw category or subcategory name.
 * @returns A sanitized string for use as a filename and Mapbox image ID.
 */
export function sanitizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

async function preloadIconsForCategory(
  map: mapboxgl.Map,
  subfolder: string,
  suffix: string,
  categories: Category[]
): Promise<void> {
  for (const category of categories) {
    const baseId = sanitizeName(category.name);
    await tryLoadIcon(map, subfolder, `${baseId}${suffix}.png`);
    await tryLoadIcon(map, subfolder, `${baseId}${suffix}_group.png`);

    for (const sub of category.subcategories) {
      const subId = sanitizeName(sub.name);
      await tryLoadIcon(map, subfolder, `${subId}${suffix}.png`);
      await tryLoadIcon(map, subfolder, `${subId}${suffix}_group.png`);
    }
  }

  // Ensure default fallbacks are always available
  await tryLoadIcon(map, subfolder, `default${suffix}.png`);
  await tryLoadIcon(map, subfolder, `default_group${suffix}.png`);
}



/**
 * Discover folders containing "/assets/3DModels/<id>/scene.gltf" at build time.
 * Works with Vite/Rollup. If your bundler differs, adjust or hardcode the list.
 */
async function list3DModelFolders(): Promise<string[]> {
  try {
    const res = await fetch('/assets/3DModels/manifest.json', { cache: 'no-cache' });
    const text = await res.text();
    if (!res.ok) return [];
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s) : [];
  } catch (e) {
    console.error('[models] manifest fetch failed:', e);
    return [];
  }
}

/**
 * Attempts to load a single icon image and register it with the map style.
 *
 * If the image exists at `/assets/2DIcons/{filename}`, it is added to the map via `map.addImage` and recorded in the IconRegistry. 
 *
 * @param map - The Mapbox map instance.
 * @param filename - The icon filename (e.g. "tree.png" or "tree_group.png").
 * @returns A promise that resolves once the load attempt completes.
 */
async function tryLoadIcon(
  map: mapboxgl.Map,
  subfolder: string,
  filename: string
): Promise<void> {
  const url = `/assets/${subfolder}/${filename}`;
  return new Promise<void>((resolve) => {
    map.loadImage(url, (error, image) => {
      if (error || !image) {
        // console.warn(`Failed to load icon: ${url} falling back to default.`);
        const fallback = filename.endsWith('_group.png') ? 'default_group.png' : 'default.png';

        map.loadImage(`/assets/${subfolder}/${fallback}`, (fbErr, fbImg) => {
          if (!fbErr && fbImg) {
            if (!map.hasImage(filename)) map.addImage(filename, fbImg);
            IconRegistry.register(filename);
          }
          resolve();
        });
        return;
      }

      if (!map.hasImage(filename)) map.addImage(filename, image);
      IconRegistry.register(filename);
      resolve();
    });
  });
}


/**
 * Attempts to load a single glyph image and register it with the map style.
 *
 * If the image exists at `/assets/2DGlyphs/{filename}`, it is added to the map via `map.addImage` and recorded in the GlyphRegistry. 
 *
 * @param map - The Mapbox map instance.
 * @param filename - The glyph filename (e.g. "tree_g.png").
 * @returns A promise that resolves once the load attempt completes.
 */
async function tryLoadGlyph(
  map: mapboxgl.Map,
  filename: string
): Promise<void> {
  const url = `/assets/2DGlyphs/${filename}`;
  return new Promise<void>(resolve => {
    map.loadImage(url, (error, image) => {
      if (!error && image) {
        map.addImage(filename, image);
        GlyphRegistry.register(filename);
      }
      resolve();
    });
  });
}
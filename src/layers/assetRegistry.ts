import * as THREE from 'three';

/**
 * A simple registry to track which icon IDs have been loaded into the Mapbox style.
 * Prevents redundant `map.addImage` calls for the same icon.
 */
export const IconRegistry = {
  /**
   * Set of icon IDs (filenames) that have been successfully loaded.
   */
  loadedIcons: new Set<string>(),

  /**
   * Checks whether the given icon ID is already registered as loaded.
   *
   * @param id - The icon identifier, typically the filename (e.g. "tree.png").
   * @returns True if the icon has previously been loaded.
   */
  has(id: string): boolean {
    return this.loadedIcons.has(id);
  },

  /**
   * Registers an icon ID as loaded, so future load attempts can be skipped.
   *
   * @param id - The icon identifier to record.
   */
  register(id: string): void {
    this.loadedIcons.add(id);
  }
};


/**
 * A simple registry to track which glyph IDs have been loaded into the Mapbox style.
 * Prevents redundant `map.addImage` calls for the same glyph.
 */
export const GlyphRegistry = {
  /**
   * Set of glyph IDs (filenames) that have been successfully loaded.
   */
  loadedGlyphs: new Set<string>(),

  /**
   * Checks whether the given glyph ID is already registered as loaded.
   *
   * @param id - The glyph identifier, typically the filename (e.g. "tree.png").
   * @returns True if the glyph has previously been loaded.
   */
  has(id: string): boolean {
    return this.loadedGlyphs.has(id);
  },

  /**
   * Registers a glyph ID as loaded, so future load attempts can be skipped.
   *
   * @param id - The glyph identifier to record.
   */
  register(id: string): void {
    this.loadedGlyphs.add(id);
  }
};


/**
 * Registry for managing loaded 3D models.
 */
export type ModelValue = THREE.Object3D | (() => Promise<THREE.Object3D>);

export const ModelRegistry = {
  loadedModels: new Map<string, THREE.Object3D>(),

  async register(id: string, value: ModelValue): Promise<void> {
    if (this.loadedModels.has(id)) return;
    const obj = typeof value === 'function'
      ? await (value as () => Promise<THREE.Object3D>)()
      : value;
    this.loadedModels.set(id, obj);
  },

  has(id: string): boolean { return this.loadedModels.has(id); },
  get(id: string): THREE.Object3D | undefined { return this.loadedModels.get(id); }
};
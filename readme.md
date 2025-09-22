# Landmark Visualization
A web application that displays a 3D terrain map (using Mapbox), along with various Points of Interest (PoIs) loaded from quadtree files. This project, part of a Bachelor's Thesis, is written in TypeScript, HTML, and CSS.

## Installation
After cloning the repository, please install the dependencies: 
> npm install

## Usage
Start the development server:
> npm run start
This opens your browser to the localhost URL.

or start the production build:
> npm run build

## Python preprocessing pipeline

This repo includes a Python pipeline that fetches OpenStreetMap PoIs for Austria and prepares compact quadtree files for the web app.

**What it does**
1. **Fetch OSM tiles (Overpass API):** The country bbox is split into lat/lon steps (default `0.5°`). Each tile is downloaded (with basic retry/backoff and on-disk caching in `data/overpass_cache`).  
2. **Preprocess XML → JSON:** For each tile, only `<node>` elements with at least one `<tag>` are kept. They are converted to GeoJSON‑like point features and filtered to drop entries with missing geometry or with no meaningful tags. The result per tile is saved in `data/preprocessed_tiles`.
3. **Classify PoIs:** Features are mapped to `(Category, Subcategory)` using a dictionary of rules (e.g., Food & Drink, Nature, Transportation). There are simple name-based fallbacks and unclassified features are logged to `unclassified_pois.json`.
4. **Build quadtrees per subcategory:** Using the Austria bbox, each (Category/Subcategory) set is spatially split into 16 chunks (two rounds of quadrant subdivision), then each chunk is turned into a quadtree (max depth 6, ~50 POIs per leaf) and written under `public/data/quadtrees/<Category>_<Subcategory>/quadtree_{i}.json`.
5. **Export category hierarchy (optional):** A helper script writes `public/data/subcat_definitions.json` derived from the rules so the frontend can present category/subcategory pickers.

**Quick start**
```bash
# 1) End‑to‑end (fetch → preprocess → classify → quadtrees)
python main_preprocess.py           # defaults: 0.5° steps, Austria bbox

# Common flags
python main_preprocess.py --skip-fetch           # reuse cached Overpass tiles
python main_preprocess.py --skip-preprocessing   # reuse existing JSON tiles
python main_preprocess.py --only-subcats         # limit to a test set (e.g., Peak)

# 2) Individual steps (optional)
# Fetch Overpass tiles for Austria into data/overpass_cache
python fetch_overpass.py --lat_step 0.5 --lon_step 0.5 --cache_dir data/overpass_cache --skip_fetch

# Convert XML tiles → filtered JSON
python preprocess_tiles.py --input_folder data/overpass_cache --output_folder data/preprocessed_tiles

# Export Category → [Subcategories] for the UI
python generate_cat_hierarchy.py
```

**Key paths**
- Cache: `data/overpass_cache/`
- Preprocessed JSON: `data/preprocessed_tiles/`
- Quadtrees: `public/data/quadtrees/`
- Subcategory definitions: `public/data/subcat_definitions.json`

## Visualization (frontend)

The web app is built on Mapbox GL JS with terrain enabled. It consumes the pre-generated quadtree JSONs per (Category/Subcategory) and renders multiple visualization modes (2D icons/glyphs/text, heatmaps, and simple 3D markers). Data is fetched on demand for the current viewport and cached client‑side.

- **Data loading & cache:** Quadtree chunks (0–15) are fetched per (category, subcategory) with an in‑memory LRU cache and abortable in‑flight requests. Neighbor chunks around the viewport are opportunistically prefetched to reduce panning hitches.
- **Feature construction:** For a requested depth, internal quadtree nodes yield **cluster features** (centroids) and leaf nodes yield **detail features** (real PoIs). A companion path builds detail‑only features for categorized heatmaps.
- **Modes:** 
  - *Combined 2D:* icons + glyphs + optional text.
  - *Heatmaps:* circle, polygon, and categorized (detail‑driven).
  - *3D:* lightweight model billboards for clusters/details.
- **Update loop:** On map move/zoom or UI change, the app computes effective LOD, fetches features for visible categories, updates 2D/3D layers, and refreshes per‑subcategory counts (within a radius around the center).

### Level of Detail (LoD) selection

LoD adapts to what you actually see, blending map zoom with camera geometry so tilted, low altitude views reveal more detail while high, flat views cluster aggressively.

1. **Altitude AGL sampling.** Sample terrain elevation at the viewport corners + center via `queryTerrainElevation`. Derive camera altitude above ground (AGL) per sample using the free‑camera altitude; average these to a single **altitudeAGL** (meters).
2. **Geometry-based zoom.** Convert altitudeAGL and the current vertical FOV (radians) into a **geometry zoom**:
   
\( visibleSpan = 2 \cdot altitudeAGL \cdot \tan(\tfrac{fov}{2}) \)
\( geometryZoom = \log_2\!\big( \tfrac{earthCircumference}{visibleSpan} \big) \)

3. **Pitch‑aware blending.** Blend **geometryZoom** with the map’s zoom using pitch \(p\): weight = 0 at \(p\le 30^\circ\), 1 at \(p\ge 60^\circ\). Intermediate pitches interpolate linearly.
4. **Discrete quadtree depth.** Map the effective zoom to a quadtree depth:

   - \(\le 8\) → depth 1 (coarsest)
   - \(\le 9\) → depth 2
   - \(\le 12\) → depth 3
   - \(\le 14\) → depth 4
   - \(\le 15\) → depth 5
   - else → depth 6 (finest)

5. **Usage.** The chosen **depth** controls which quadtree nodes become clusters vs. details, which chunks to fetch for the current viewport, and how we size counting radii for on‑map summaries.

**Relevant files (frontend):**
- LoD computation & helpers: `lodService.ts`
- Quadtree traversal & feature building: `quadtreeTraversal.ts`
- Chunk fetch + cache + prefetch: `quadtreeService.ts`
- Update cycle & layer refresh: `updateMapData.ts`
- App state (map, categories, radii): `appState.ts`
- Map init & controls/terrain wiring: `initMap.ts`, `controls.ts`, `terrain.ts`, `types.ts`


### Visualization layers

- **Combined 2D (`combined2DLayer.ts`)** — one pass that draws icons + glyphs + optional labels; minimizes layer churn and keeps ordering predictable across categories.
- **2D Icon (`2DIconLayer.ts`)** — category/subcategory icon sprites with zoom-aware size and collision-aware placement.
- **2D Glyphs (`2DGlyphsLayer.ts`)** — small semantic overlays (e.g., type/importance marks) rendered as lightweight symbols to enrich icons without extra fetches.
- **2D Text (`2DTextLayer.ts`)** — short labels for detail features; fades out at higher speeds/zooms to avoid clutter.
- **Categorized Heatmap (`categorizedHeatmap.ts`)** — detail‑only path; counts per subcategory and draws category‑colorized density.
- **3D Layer (`3DLayer.ts`)** — billboarded markers or simple meshes for clusters/details; sizes and fade are tied to the chosen LoD depth.

### Assets

- **Loader (`assetLoader.ts`)** pulls sprites (icons/glyphs) and 3D model manifests on startup; de‑dupes registrations and exposes a ready‑promise.
- **Registry (`assetRegistry.ts`)** central index: `getIcon(id)`, `getGlyph(id)`, `getModel(id)` used by 2D/3D layers. Missing assets fall back to neutral placeholders.

### Layer state & updates

- **Layer state manager (`layerStateManager.ts`)** toggles layer visibility, z‑order, and style presets (e.g., “2D combined”, “Heatmap”, “3D”).
- **Update cycle (`updateMapData.ts`)** computes effective LoD → fetches quadtree chunks → builds cluster/detail features → updates active layers → refreshes counts around the map center.

### Controls & interactions

- **Controls (`controls.ts`)**: category/subcategory filters, radius selector for on‑map counts, heatmap on/off, 2D/3D presets.
- **Map/Terrain (`initMap.ts`, `terrain.ts`)**: Mapbox GL JS init, terrain enable, and camera settings that feed the LoD logic.
- **Types (`types.ts`)**: shared data contracts for features, nodes, chunk keys, and layer options.

### Project folder locations
```bash
/data                     # caches & preprocessed tiles (generated)
/public/data/quadtrees    # quadtree JSONs per (Category_Subcategory) (generated)
/frontend                 # (virtual) app modules
```

### Category Taxonomy

  "Food & Drink": [
    "Bar",
    "Café",
    "Drinking Water",
    "Fast Food",
    "Restaurant"
  ],
  "Amenity": [
    "ATM",
    "Bank",
    "Bench",
    "Clinic",
    "Fuel",
    "Hospital",
    "Library",
    "Parking",
    "Pharmacy",
    "Police",
    "Post Box",
    "Post Office",
    "School",
    "Toilet",
    "University",
    "Waste Basket"
  ],
  "Emergency": [
    "Defibrillator",
    "Fire Extinguisher",
    "Phone"
  ],
  "Accommodation": [
    "Hostel",
    "Hotel",
    "Hut",
    "Motel",
    "Shelter"
  ],
  "Tourism": [
    "Art",
    "Attraction",
    "Casino",
    "Castle",
    "Historic",
    "Information",
    "Monument",
    "Museum",
    "Picnic Site",
    "Statue",
    "View Point",
    "Zoo"
  ],
  "Shop": [
    "Bakery",
    "Butcher",
    "Hairdresser",
    "Jewellery",
    "Misc Shops",
    "Shoes",
    "Supermarket"
  ],
  "Settlement": [
    "City",
    "Hamlet",
    "Misc Settlements",
    "Suburb",
    "Town",
    "Village"
  ],
  "Nature": [
    "Cave",
    "Glacier",
    "Misc Nature",
    "Mountain Pass",
    "Peak",
    "Rock",
    "Spring",
    "Tree",
    "Waterfall"
  ],
  "Transportation": [
    "Bus Station",
    "Bus Stop",
    "Pedestrian Crossing",
    "Traffic Signals",
    "Train Station",
    "Train Stop"
  ],
  "Infrastructure": [
    "Ford",
    "Gate",
    "Power"
  ],
  "Building": [
    "Cemetery",
    "Church",
    "Mosque",
    "Place of Worship",
    "Residential",
    "Synagogue"
  ]
 
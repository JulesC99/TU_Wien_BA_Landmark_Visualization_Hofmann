import logging
import os
import time
import requests
from typing import List, Tuple
from bbox_handler import BBox, get_austria_bbox

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

def build_overpass_query(bbox: BBox) -> str:
    """
    Build an Overpass query to retrieve all nodes within 'bbox'.
    Returns a string that can be sent to Overpass via GET or POST.
    """
    query = f"""
    [out:xml][timeout:900];
    (
      node({bbox.min_lat},{bbox.min_lon},{bbox.max_lat},{bbox.max_lon});
    );
    out center;
    """
    return query.strip()


def fetch_osm_data(bbox: BBox) -> str:
    """
    Attempt to fetch OpenStreetMap data from Overpass for 'bbox'.
    Returns the Overpass XML response as a string if successful.
    """
    query = build_overpass_query(bbox)
    max_attempts = 3
    
    for attempt in range(max_attempts):
        try:
            logging.info(f"[Attempt {attempt+1}/{max_attempts}] Overpass query for: {bbox}")
            response = requests.get(OVERPASS_URL, params={"data": query}, timeout=600)
            
            # Check for rate-limiting
            if response.status_code == 429:
                logging.warning(f"Received 429 Too Many Requests from Overpass on attempt {attempt+1}.")
                backoff_seconds = 5 * (attempt + 1)
                logging.info(f"Sleeping {backoff_seconds}s before retry...")
                time.sleep(backoff_seconds)
                continue  # retry

            response.raise_for_status()  # raises HTTPError if status not 200
            time.sleep(1.0)
            return response.text
        
        except requests.exceptions.RequestException as e:
            logging.warning(f"Request error on attempt {attempt+1}/{max_attempts}: {e}")
            backoff_seconds = 3 * (attempt + 1)
            logging.info(f"Sleeping {backoff_seconds}s before retry...")
            time.sleep(backoff_seconds)
            continue

    raise requests.exceptions.RequestException(
        f"Failed to fetch data for bbox {bbox} after {max_attempts} attempts."
    )
    
# -----------------------------------------------------------------------------
# Tiling Logic
# -----------------------------------------------------------------------------

def generate_tile_bboxes(
    bbox: BBox, 
    lat_step: float = 0.5, 
    lon_step: float = 0.5
) -> List[BBox]:
    """
    Split 'bbox' into multiple smaller bounding boxes by stepping in increments of 'lat_step' vertically and 'lon_step' horizontally.
    """
    bboxes = []
    current_lat = bbox.min_lat

    if lat_step <= 0.0:
        raise ValueError("lat_step must be > 0.")
    if lon_step <= 0.0:
        raise ValueError("lon_step must be > 0.")

    while current_lat < bbox.max_lat:
        next_lat = min(current_lat + lat_step, bbox.max_lat)

        current_lon = bbox.min_lon
        while current_lon < bbox.max_lon:
            next_lon = min(current_lon + lon_step, bbox.max_lon)

            subbox = BBox(
                min_lat=current_lat,
                min_lon=current_lon,
                max_lat=next_lat,
                max_lon=next_lon
            )
            bboxes.append(subbox)

            current_lon = next_lon
        current_lat = next_lat

    return bboxes


# -----------------------------------------------------------------------------
# Fetching with Local Cache
# -----------------------------------------------------------------------------

def fetch_or_load_tile(
    bbox: BBox, 
    tile_id: int, 
    cache_dir: str, 
    skip_fetch: bool
) -> Tuple[bool, str]:
    """
    For a given 'bbox' tile, returns a tuple (is_fresh, tile_path):
      - If 'skip_fetch' is True and the tile file exists, does not refetch. is_fresh=False.
      - Otherwise fetch from Overpass, save to tile_{tile_id}.xml, is_fresh=True.

    """
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir, exist_ok=True)

    tile_path = os.path.join(cache_dir, f"tile_{tile_id}.xml")

    # If skip_fetch is set and file exists, no fetch
    if skip_fetch and os.path.exists(tile_path):
        logging.info(f"[Tile {tile_id}] Using cached file: {tile_path}")
        return False, tile_path

    # Otherwise, fetch fresh
    logging.info(f"[Tile {tile_id}] Fetching Overpass data...")
    xml_data = fetch_osm_data(bbox)
    with open(tile_path, 'w', encoding='utf-8') as f:
        f.write(xml_data)
    logging.info(f"[Tile {tile_id}] Saved Overpass data to {tile_path}")

    return True, tile_path


def fetch_tiles_in_steps(
    bbox: BBox,
    lat_step: float = 0.5,
    lon_step: float = 0.5,
    cache_dir: str = "data/overpass_cache",
    skip_fetch: bool = False
) -> List[str]:
    """
    Split 'bbox' by lat/lon steps, then for each sub-tile either load a cached Overpass XML (if 'skip_fetch' and file exists) or fetch new data from Overpass. 
    Returns a list of file paths to the .xml tiles.
    """
    sub_bboxes = generate_tile_bboxes(bbox, lat_step, lon_step)
    xml_file_paths = []

    for idx, subbox in enumerate(sub_bboxes):
        logging.info(f"[Tile {idx}] BBox={subbox}")
        is_fresh, tile_path = fetch_or_load_tile(subbox, idx, cache_dir, skip_fetch)
        xml_file_paths.append(tile_path)

        if is_fresh:
            logging.info(f"[Tile {idx}] Downloaded new data from Overpass.")
        else:
            logging.info(f"[Tile {idx}] Using cached data; no fetch needed.")

    return xml_file_paths

def fetch_tiles_for_bbox(
    bbox: BBox,
    lat_step: float = 0.5,
    lon_step: float = 0.5,
    cache_dir: str = "data/overpass_cache",
    skip_fetch: bool = False
) -> List[str]:
    """
    Splits 'bbox' into tile bboxes (via lat/lon steps), then either fetches from Overpass or uses existing cache depending on 'skip_fetch'.
    Returns a list of .xml file paths for all tiles.
    """
    return fetch_tiles_in_steps(
        bbox=bbox,
        lat_step=lat_step,
        lon_step=lon_step,
        cache_dir=cache_dir,
        skip_fetch=skip_fetch
    )

    
# -----------------------------------------------------------------------------
# Command-Line Entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Fetch Overpass tiles for a given BBox.")
    parser.add_argument(
        "--lat_step", 
        type=float, 
        default=0.5,
        help="Vertical step size in degrees for subdividing the bounding box."
    )
    parser.add_argument(
        "--lon_step", 
        type=float, 
        default=0.5,
        help="Horizontal step size in degrees for subdividing the bounding box."
    )
    parser.add_argument(
        "--cache_dir", 
        type=str, 
        default="data/overpass_cache",
        help="Local folder to store the downloaded/cached .xml tiles."
    )
    parser.add_argument(
        "--skip_fetch",
        action="store_true",
        help="If set, do not re-fetch if tile XML files already exist."
    )
    args = parser.parse_args()

    logging.info("Starting Overpass fetch for bounding box in tiles...")

    tile_file_paths = fetch_tiles_for_bbox(
        bbox=get_austria_bbox(),
        lat_step=args.lat_step,
        lon_step=args.lon_step,
        cache_dir=args.cache_dir,
        skip_fetch=args.skip_fetch
    )

    logging.info(f"Done fetching. {len(tile_file_paths)} tile files stored:")
    for path in tile_file_paths:
        logging.info(f"  - {path}")

    sys.exit(0)
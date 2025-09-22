import os
import sys
import glob
import logging

from fetch_overpass import fetch_tiles_for_bbox
from preprocess_tiles import preprocess_all_tiles
from classification_pipeline import build_subcat_quadtrees
from quadtree_builder import Quad
from bbox_handler import get_austria_bbox

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

def main(skip_preprocessing: bool, skip_fetch: bool, only_subcats_flag: bool) -> None:
    """
    Main entry point for the entire pipeline:
      1) Possibly fetch Overpass tiles.
      2) Possibly parse them into JSON.
      3) Classify + build subcategory quadtrees => write results to public/data.
    """
    logger.info("=== Start: main_preprocess ===")

    script_dir = os.path.dirname(__file__)
    project_root = os.path.abspath(os.path.join(script_dir, "..", ".."))

    # Overpass Cache & Preprocessed dirs
    cache_dir = os.path.join(project_root, "data", "overpass_cache")
    preproc_dir = os.path.join(project_root, "data", "preprocessed_tiles")
    output_dir = os.path.join(project_root, "public", "data", "quadtrees")

    logger.info("Cache Dir:      %s", cache_dir)
    logger.info("Preproc Dir:    %s", preproc_dir)
    logger.info("Output Dir:     %s", output_dir)

    lat_step, lon_step = 0.5, 0.5

    # 1) Possibly fetch Overpass data
    logger.info("Step 1: Overpass fetch (skip_fetch=%s)", skip_fetch)
    tile_files = fetch_tiles_for_bbox(
        bbox=get_austria_bbox(),
        lat_step=lat_step,
        lon_step=lon_step,
        cache_dir=cache_dir,
        skip_fetch=skip_fetch
    )
    logger.info(" → %d XML tiles ready.", len(tile_files))

    # 2) Possibly preprocess
    if not skip_preprocessing:
        logger.info("Step 2: Preprocessing XML → JSON in %s", preproc_dir)
        os.makedirs(preproc_dir, exist_ok=True)
        preprocess_all_tiles(input_folder=cache_dir, output_folder=preproc_dir)
    else:
        logger.info("Skipping preprocessing step; using existing JSON in %s", preproc_dir)

    # 3) Gather all JSON from preproc_dir
    if not os.path.isdir(preproc_dir):
        logger.error("Directory '%s' does not exist! Exiting.", preproc_dir)
        sys.exit(1)

    json_paths = glob.glob(os.path.join(preproc_dir, "*.json"))
    if not json_paths:
        logger.error("No preprocessed JSON found in '%s'! Exiting.", preproc_dir)
        sys.exit(1)

    # 4) Classify + build subcategory quadtrees
    master_bbox = get_austria_bbox()
    quad_bbox = Quad(master_bbox.min_lat, master_bbox.min_lon,
                     master_bbox.max_lat, master_bbox.max_lon)
    build_subcat_quadtrees(
        input_json_paths=json_paths,
        master_bbox=quad_bbox,
        output_folder=output_dir,
        only_subcats=only_subcats_flag,
        test_subcats=["Peak"]
    )

    logger.info("=== Done main_preprocess ===")

if __name__ == "__main__":
    skip_pre = "--skip-preprocessing" in sys.argv
    skip_fet = "--skip-fetch" in sys.argv
    only_scat = "--only-subcats" in sys.argv

    if skip_pre:
        logger.info("User requested skipping preprocessing step.")
    if skip_fet:
        logger.info("User requested skipping fetch step.")
    if only_scat:
        logger.info("User requested limiting subcats to Peak only (by default).")

    main(skip_preprocessing=skip_pre, skip_fetch=skip_fet, only_subcats_flag=only_scat)
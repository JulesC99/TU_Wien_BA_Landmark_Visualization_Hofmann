import os
import json
import logging
from collections import defaultdict
from typing import Dict, Any, List, Tuple

from classification_config import CLASSIFICATION_RULES
from quadtree_builder import Quad, build_quadtree_for_category

# ---------------------------------------------------------------------
# Constants and Logger
# ---------------------------------------------------------------------
UNCLASSIFIED_FILE = "unclassified_pois.json"
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------
def classify_via_dict(props: Dict[str, Any]) -> Tuple[str, str] | None:
    """
    Classify a POI using CLASSIFICATION_RULES. Returns (category, subcategory) or None if not found.
    Uses '*' as a fallback if a specific value is missing.
    """
    for key, mapping in CLASSIFICATION_RULES.items():
        if key in props:
            val = props[key]
            if val in mapping:
                return mapping[val]
            if '*' in mapping:
                return mapping['*']
    return None

def store_unclassified(feature: Dict[str, Any]) -> None:
    """
    Append minimal unclassified POI data to UNCLASSIFIED_FILE.
    """
    record = {
        "id": feature["properties"].get("id"),
        "osm_type": feature["properties"].get("osm_type"),
        "lat": feature["properties"].get("lat"),
        "lon": feature["properties"].get("lon"),
        "tags": {
            k: v
            for k, v in feature["properties"].items()
            if k not in ("id", "osm_type", "lat", "lon")
        },
    }
    with open(UNCLASSIFIED_FILE, "a", encoding="utf-8") as file_obj:
        json.dump(record, file_obj, ensure_ascii=False)
        file_obj.write("\n")

def classify_poi(feature: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Classify a feature into (category, subcategory, reason).
      - Return ("Discard", "Discard", <reason>) if missing geometry, tags, or unclassifiable.
      - Otherwise return (category, subcategory, "ok").
    """
    props = feature.get("properties", {})

    # 1) Check geometry
    if props.get("lat") is None or props.get("lon") is None:
        return ("Discard", "Discard", "missing_geometry")

    # 2) Check tags
    skip_keys = ("id", "osm_type", "lat", "lon", "created_by")
    tag_keys = [k for k in props if k not in skip_keys]
    if not tag_keys:
        return ("Discard", "Discard", "no_tags")

    # 3) Dict-based classification
    dict_cls = classify_via_dict(props)
    if dict_cls:
        return (*dict_cls, "ok")

    # 4) Name-based fallback
    name = props.get("name", "").lower()
    if "hut" in name or "cabin" in name:
        return ("Accommodation", "Hut", "ok")
    if "gipfel" in name:
        return ("Nature", "Peak", "ok")
    if any(w in name for w in ("waterfall", "falls", "cascad")):
        return ("Nature", "Waterfall", "ok")

    # 5) Unclassified fallback
    store_unclassified(feature)
    return ("Discard", "Discard", "unclassified")


# ---------------------------------------------------------------------
# Helper: subdivide a bounding box into 16 smaller sub‐bboxes
#         by subdividing twice.
# ---------------------------------------------------------------------
def subdivide_into_16(big_bbox: Quad) -> List[Quad]:
    """
    Subdivide 'big_bbox' into 16 equally sized bounding boxes:
     1) Subdivide once => 4 quadrants
     2) Subdivide each quadrant => 4 sub‐quadrants
    Total = 4 * 4 = 16.
    """
    sub4 = big_bbox.subdivide_into_quadrants()  # 4
    sub16 = []
    for quad in sub4:
        sub16.extend(quad.subdivide_into_quadrants())  # each quadrant => 4 more
    return sub16


# ---------------------------------------------------------------------
# Quadtree Building
# ---------------------------------------------------------------------
def build_subcat_quadtrees(
    input_json_paths: List[str],
    master_bbox: Quad,
    output_folder: str,
    only_subcats: bool = False,
    test_subcats: List[str] = None
) -> None:
    """
    Classify, group, and build chunked quadtrees for each (category, subcategory).
      - Subdivide 'master_bbox' into 16 smaller bounding boxes
      - For each sub-bbox, build a separate quadtree (max_depth=6)
      - Write each of the 16 quadtrees to its own file, in a subfolder.
    """
    if test_subcats is None:
        test_subcats = ["Peak"]

    total_feats = 0
    discard_stats = {
        "missing_geometry": 0,
        "no_tags": 0,
        "unclassified": 0
    }

    cat_map = defaultdict(list)

    # 1) Read + classify features
    for path in input_json_paths:
        logger.info("Reading preprocessed file: %s", path)
        with open(path, "r", encoding="utf-8") as file_obj:
            feats_in_file = json.load(file_obj)

        for feat in feats_in_file:
            total_feats += 1
            cat, sub, reason = classify_poi(feat)

            if cat == "Discard":
                if reason in discard_stats:
                    discard_stats[reason] += 1
                else:
                    discard_stats["unclassified"] += 1
                continue

            if only_subcats and sub not in test_subcats:
                continue

            cat_map[(cat, sub)].append(feat)

    # Summaries
    total_discarded = sum(discard_stats.values())
    logger.info(
        "After classification: total=%d, #subcats=%d, discards=%d",
        total_feats, len(cat_map), total_discarded
    )

    os.makedirs(output_folder, exist_ok=True)
    logger.info("Outputting quadtrees to directory: %s", output_folder)

    # 2) Build and save chunked quadtrees
    for (category, subcat), feats in cat_map.items():
        logger.info("   → Building 16 sub‐quadtrees for %s/%s with %d features",
                    category, subcat, len(feats))
        
        # Create a dedicated folder for this subcat
        subcat_folder_name = f"{category.replace(' ', '_')}_{subcat.replace(' ', '_')}"
        subcat_folder_path = os.path.join(output_folder, subcat_folder_name)
        os.makedirs(subcat_folder_path, exist_ok=True)

        # Subdivide into 16 bounding boxes
        chunk_bboxes = subdivide_into_16(master_bbox)

        for i, cbox in enumerate(chunk_bboxes):
            # Filter features that lie in cbox
            chunk_feats = [f for f in feats if cbox.contains_feature(f)]
            if not chunk_feats:
                # If no features in this chunk, we can skip building an empty quadtree
                continue

            # Build quadtree with max_depth=6
            qt = build_quadtree_for_category(
                features=chunk_feats,
                bbox=cbox,
                max_per_node=50  # leave as is
            )

            # Save to file: "quadtree_0.json", "quadtree_1.json", ...
            out_name = f"quadtree_{i}.json"
            out_path = os.path.join(subcat_folder_path, out_name)
            with open(out_path, "w", encoding="utf-8") as file_obj:
                json.dump(qt.to_dict(), file_obj, indent=2, ensure_ascii=False)

            logger.info("     → Saved %s with %d features", out_name, len(chunk_feats))
        
        logger.info("   → Subcat '%s/%s': wrote %d non-empty chunks", category, subcat, i + 1)

    # Final classification summary
    logger.info("Classification Summary:")
    logger.info("  Total POIs read:             %d", total_feats)
    logger.info("  Successfully classified:      %d", total_feats - total_discarded)
    logger.info("  Discarded:                    %d", total_discarded)
    logger.info("    - missing geometry:         %d", discard_stats["missing_geometry"])
    logger.info("    - no tags:                  %d", discard_stats["no_tags"])
    logger.info("    - fallback unclassified:    %d", discard_stats["unclassified"])

import os
import glob
import json
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Tuple

# -----------------------------------------------------------------------------
# Filter / Cleaning Logic
# -----------------------------------------------------------------------------

def remove_empty_nodes(xml_root: ET.Element) -> List[ET.Element]:
    """
    Returns only the <node> elements that contain at least one <tag> child.
    """
    valid_nodes = []
    for node in xml_root.findall('node'):
        tags = node.findall('tag')
        if tags:
            valid_nodes.append(node)
    return valid_nodes


def node_to_feature(node: ET.Element) -> Dict[str, Any]:
    """
    Converts a single <node> XML element into a GeoJSON-like feature dict.

    Example output:
    {
      "type": "Feature",
      "properties": {
        "id": "26027491",
        "osm_type": "node",
        "lat": 46.8092454,
        "lon": 9.8409423,
        ... possibly other <tag> data ...
      },
      "geometry": {
        "type": "Point",
        "coordinates": [9.8409423, 46.8092454]
      }
    }
    """
    node_id = node.get('id', '')
    lat_str = node.get('lat', '0.0')
    lon_str = node.get('lon', '0.0')

    lat = float(lat_str)
    lon = float(lon_str)

    # Build properties from node attributes + <tag> children
    properties = {
        "id": node_id,
        "osm_type": "node",
        "lat": lat,
        "lon": lon
    }

    for tag in node.findall('tag'):
        k = tag.get('k')
        v = tag.get('v')
        if k and v:
            properties[k] = v

    # Construct the final GeoJSON-like feature
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat]
        }
    }


def convert_nodes_to_geojson(nodes: List[ET.Element]) -> List[Dict[str, Any]]:
    """
    Converts a list of valid <node> elements into a list of GeoJSON-like features.
    """
    return [node_to_feature(n) for n in nodes]


def filter_features(features: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int, int]:
    """
    Filters out features that have:
      - Missing geometry (lat or lon == None)
      - No meaningful tags beyond id, osm_type, lat, lon, created_by
    
    Returns:
      (cleaned_list, num_discarded_missing_geo, num_discarded_no_tags)
    """
    discard_missing_geometry = 0
    discard_no_tags = 0

    cleaned = []
    for feat in features:
        props = feat.get("properties", {})

        # Check lat/lon
        lat = props.get("lat")
        lon = props.get("lon")
        if lat is None or lon is None:
            discard_missing_geometry += 1
            continue

        # Check if POI has any meaningful tags
        skip_keys = ("id", "osm_type", "lat", "lon", "created_by")
        tag_keys = [k for k in props if k not in skip_keys]
        if not tag_keys:
            discard_no_tags += 1
            continue

        cleaned.append(feat)

    return cleaned, discard_missing_geometry, discard_no_tags


# -----------------------------------------------------------------------------
# Main Tile Processing Logic
# -----------------------------------------------------------------------------
def process_single_tile(
    tile_path: str,
    output_folder: str = "data/preprocessed_tiles"
) -> Tuple[int, int]:
    """
    Reads one tile XML file from 'tile_path', filters & converts nodes to JSON, discarding those missing geometry or with no meaningful tags, 
    then writes the output to <output_folder>/<tile_basename>.json.
    Returns: (discarded_missing_geo, discarded_no_tags) for this tile.
    """
    # Load the XML tree
    try:
        tree = ET.parse(tile_path)
    except ET.ParseError as e:
        print(f"[ERROR] Failed to parse XML for {tile_path}: {e}")
        return (0, 0)  # or skip
    root = tree.getroot()

    # Convert to GeoJSON-like features
    valid_nodes    = remove_empty_nodes(root)
    geojson_data   = convert_nodes_to_geojson(valid_nodes)
    filtered_data, n_miss, n_tags = filter_features(geojson_data)

    # Prepare output path
    tile_name    = os.path.splitext(os.path.basename(tile_path))[0]
    os.makedirs(output_folder, exist_ok=True)
    output_json  = os.path.join(output_folder, f"{tile_name}.json")

    # Save the resulting JSON
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(filtered_data, f, indent=2, ensure_ascii=False)

    print(f"[INFO] Processed {tile_path} -> {output_json}")
    print(f"       -> {len(geojson_data)} features before filtering; {len(filtered_data)} after filtering.")

    return (n_miss, n_tags)


def preprocess_all_tiles(
    input_folder: str = "data/overpass_cache",
    output_folder: str = "data/preprocessed_tiles"
) -> None:
    """
    Loops over all *.xml files in 'input_folder', processes them, and saves JSON in 'output_folder'. Prints a summary of how many features were discarded (missing geometry, no tags).
    """
    script_dir   = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, os.pardir, os.pardir))

    if not os.path.isabs(input_folder):
        input_folder = os.path.join(project_root, input_folder)

    if not os.path.isabs(output_folder):
        output_folder = os.path.join(project_root, output_folder)

    os.makedirs(output_folder, exist_ok=True)

    print(f"[INFO] Looking for XML in: {input_folder}")
    print(f"[INFO] Writing JSON to:    {output_folder}")

    pattern    = os.path.join(input_folder, "*.xml")
    tile_files = glob.glob(pattern)
    if not tile_files:
        print(f"[WARN] No .xml files found in: {input_folder}")
        return

    total_missing_geo = 0
    total_no_tags     = 0

    # Process each tile file
    for tile_path in tile_files:
        n_miss, n_tags = process_single_tile(tile_path, output_folder=output_folder)
        total_missing_geo += n_miss
        total_no_tags     += n_tags

    # Print summary of discards
    print(f"[INFO] Finished preprocessing all tiles.")
    print(f"[INFO] Discarded {total_missing_geo} features missing geometry.")
    print(f"[INFO] Discarded {total_no_tags} features with no meaningful tags.")


# -----------------------------------------------------------------------------
# Command-Line Entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Preprocess Overpass XML tiles into filtered GeoJSON-like features."
    )
    parser.add_argument(
        "--input_folder", 
        type=str, 
        default="data/overpass_cache",
        help="Folder containing .xml tiles from Overpass API"
    )
    parser.add_argument(
        "--output_folder", 
        type=str, 
        default="data/preprocessed_tiles",
        help="Folder to write the resulting JSON files"
    )

    args = parser.parse_args()

    preprocess_all_tiles(
        input_folder=args.input_folder, 
        output_folder=args.output_folder
    )

    sys.exit(0)

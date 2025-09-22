import json
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple

# -----------------------------------------------------------------------------
# Tree Settings
# -----------------------------------------------------------------------------
MAX_DEPTH = 6      # Maximum depth levels for splitting
MAX_PER_NODE = 25  # Maximum number of POIs per leaf before splitting


# -----------------------------------------------------------------------------
# Quad: geographic bounding box
# -----------------------------------------------------------------------------
@dataclass
class Quad:
    """
    Represents a geographic bounding box by its south, west, north, and east edges.
    """
    south: float
    west: float
    north: float
    east: float

    def subdivide_into_quadrants(self) -> List["Quad"]:
        """
        Subdivide this bounding box into four equally sized quadrants.
        """
        mid_lat = (self.south + self.north) / 2.0
        mid_lon = (self.west + self.east) / 2.0
        return [
            Quad(self.south, self.west, mid_lat, mid_lon),
            Quad(self.south, mid_lon, mid_lat, self.east),
            Quad(mid_lat, self.west, self.north, mid_lon),
            Quad(mid_lat, mid_lon, self.north, self.east),
        ]

    def contains_feature(self, feature: Dict[str, Any]) -> bool:
        """
        Check if a feature with "geometry": {"coordinates": [lon, lat]} lies within this bounding box.
        """
        lon, lat = feature["geometry"]["coordinates"]
        return (self.south <= lat <= self.north) and (self.west <= lon <= self.east)

    @staticmethod
    def from_tuple(t: Tuple[float, float, float, float]) -> "Quad":
        """
        Construct a Quad from (south, west, north, east).
        """
        return Quad(*t)

    def to_tuple(self) -> Tuple[float, float, float, float]:
        """
        Return (south, west, north, east).
        """
        return (self.south, self.west, self.north, self.east)
    
# -----------------------------------------------------------------------------
# QuadtreeNode: either a leaf with data or an internal node with children
# -----------------------------------------------------------------------------
class QuadtreeNode:
    """
    A node in the quadtree. If it's a leaf, it holds a list of features. Otherwise, it has children that further subdivide the bounding box.
    """

    def __init__(self, bbox: Quad):
        self.bbox = bbox
        # Data if this node is a leaf; otherwise empty if subdivided
        self.data: List[Dict[str, Any]] = []
        # Children if the node is split
        self.children: List["QuadtreeNode"] = []

        # Summary attributes
        self.poiCount: int = 0
        self.averagePosition: Optional[Tuple[float, float]] = None

    def _compute_average_position(self) -> None:
        """
        Compute the average position of this node's features.
        - Leaf nodes: average of their own features.
        - Non-leaf nodes: weighted average of children's average positions.
        """
        # Recurse into children first
        for child in self.children:
            child._compute_average_position()

        if not self.children:
            # Leaf node: direct average of features
            n = len(self.data)
            if n > 0:
                sum_lon = sum(f["geometry"]["coordinates"][0] for f in self.data)
                sum_lat = sum(f["geometry"]["coordinates"][1] for f in self.data)
                self.averagePosition = (sum_lon / n, sum_lat / n)
                self.poiCount = n
        else:
            # Internal node: weighted average of children's average positions
            total = 0
            sum_lon = 0.0
            sum_lat = 0.0
            for c in self.children:
                # Each child might have 0 if it didn't have any data
                if c.averagePosition and c.poiCount > 0:
                    lon, lat = c.averagePosition
                    sum_lon += lon * c.poiCount
                    sum_lat += lat * c.poiCount
                    total += c.poiCount
            self.poiCount = total
            if total > 0:
                self.averagePosition = (sum_lon / total, sum_lat / total)

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert this node (and its children) to a serializable dictionary.
        """
        return {
            "bbox": {
                "south": self.bbox.south,
                "west":  self.bbox.west,
                "north": self.bbox.north,
                "east":  self.bbox.east,
            },
            "poiCount":        self.poiCount,
            "leafCount":       len(self.data),
            "averagePosition": self.averagePosition,
            "data":            self.data,
            "children":        [c.to_dict() for c in self.children],
        }


# -----------------------------------------------------------------------------
# Build the quadtree for a single category
# -----------------------------------------------------------------------------
def build_quadtree_for_category(
    features: List[Dict[str, Any]],
    bbox: Quad,
    max_per_node: int = MAX_PER_NODE
) -> QuadtreeNode:
    """
    Build a quadtree from 'features' within 'bbox', recursively splitting until we either reach MAX_DEPTH, or node has <= max_per_node features.
    """

    def _build(feats: List[Dict[str, Any]], box: Quad, depth: int) -> QuadtreeNode:
        node = QuadtreeNode(box)
        node.data = feats

        # If we're at max depth or small enough, become a leaf
        if depth >= MAX_DEPTH or len(feats) <= max_per_node:
            node._compute_average_position()
            return node

        # Otherwise, subdivide
        for sub_box in box.subdivide_into_quadrants():
            bucket = [f for f in feats if sub_box.contains_feature(f)]
            if bucket:
                child = _build(bucket, sub_box, depth + 1)
                node.children.append(child)

        # If we added children, clear the data from this node
        if node.children:
            node.data = []

        # Compute final average for this node
        node._compute_average_position()
        return node

    return _build(features, bbox, depth=0)

# -----------------------------------------------------------------------------
# Compute per‐depth summary statistics for a finished quadtree
# -----------------------------------------------------------------------------
def compute_depth_stats(root: QuadtreeNode) -> Dict[int, Dict[str, float]]:
    stats: Dict[int, Dict[str, float]] = {}
    queue: List[Tuple[QuadtreeNode, int]] = [(root, 0)]

    while queue:
        node, depth = queue.pop(0)
        entry = stats.setdefault(depth, {
            "nodeCount": 0,
            "totalPois": 0,
            "sumChunkKm": 0.0,
        })
        entry["nodeCount"] += 1
        entry["totalPois"] += node.poiCount
        entry["sumChunkKm"] += node.chunkSizeKm

        for c in node.children:
            queue.append((c, depth + 1))

    # finalize averages
    for depth, e in stats.items():
        e["avgChunkKm"] = e["sumChunkKm"] / e["nodeCount"] if e["nodeCount"] else 0.0
        del e["sumChunkKm"]

    return stats


# -----------------------------------------------------------------------------
# Command‐line entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Build quadtree(s) for POI categories.")
    parser.add_argument(
        "--subcats", type=str, default="Art,Tree",
        help="Comma-separated list of subcategories."
    )
    parser.add_argument(
        "--inputDir", type=Path, default=Path("data/preprocessed_tiles"),
        help="Folder of POI JSON files per subcat."
    )
    parser.add_argument(
        "--bbox", type=float, nargs=4, required=True,
        metavar=("S","W","N","E"),
        help="Overall bounding box for all features."
    )
    parser.add_argument(
        "--outputDir", type=Path, default=Path("public/data"),
        help="Where to write the quadtree JSON files."
    )
    args = parser.parse_args()

    subcats = [s.strip() for s in args.subcats.split(",")]
    args.outputDir.mkdir(parents=True, exist_ok=True)
    master_bbox = Quad(*args.bbox)

    for sc in subcats:
        in_path = args.inputDir / f"{sc.replace(' ','_')}.json"
        out_tree = args.outputDir / f"{sc.replace(' ','_')}_quadtree.json"
        out_stats = args.outputDir / f"{sc.replace(' ','_')}_stats.json"

        # Load the POIs (assume JSON is a single list of features)
        features = json.loads(in_path.read_text())

        # Build quadtree
        root = build_quadtree_for_category(features, master_bbox)

        # Write quadtree to disk
        out_tree.write_text(json.dumps(root.to_dict(), ensure_ascii=False, indent=2))

        stats = compute_depth_stats(root)
        out_stats.write_text(json.dumps(stats, ensure_ascii=False, indent=2))

        print(f"Wrote {out_tree} and {out_stats}")

    sys.exit(0)
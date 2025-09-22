from typing import NamedTuple, List

# ---------------------------------------------------------------------
# BBox Definitions (min_lat, min_lon, max_lat, max_lon)
# ---------------------------------------------------------------------
class BBox(NamedTuple):
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float

AUSTRIA_BBOX = BBox(46.372652, 9.530952, 49.017078, 17.16058)

# ---------------------------------------------------------------------
# Split Logic
# ---------------------------------------------------------------------

def split_bbox(bbox: BBox, divider: int) -> List[BBox]:
    """Split a BBox into divider x divider evenly sized chunks."""
    lat_step = (bbox.max_lat - bbox.min_lat) / divider
    lon_step = (bbox.max_lon - bbox.min_lon) / divider
    return [
        BBox(
            bbox.min_lat + i * lat_step,
            bbox.min_lon + j * lon_step,
            bbox.min_lat + (i + 1) * lat_step,
            bbox.min_lon + (j + 1) * lon_step
        )
        for i in range(divider)
        for j in range(divider)
    ]

# ---------------------------------------------------------------------
# Provider Methods
# ---------------------------------------------------------------------

def get_austria_bbox() -> BBox:
    """Return Austria's bounding box as a BBox."""
    return AUSTRIA_BBOX

def get_austria_chunked(divider: int) -> List[BBox]:
    """Return a list of BBox chunks for Austria, divided by `divider`."""
    return split_bbox(AUSTRIA_BBOX, divider)

def get_bbox_chunked(bbox: BBox, divider: int) -> List[BBox]:
    """Return a list of BBox chunks for any BBox."""
    return split_bbox(bbox, divider)

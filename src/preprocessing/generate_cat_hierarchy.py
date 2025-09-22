import json
import logging
import os
from typing import Dict, Set
from classification_config import CLASSIFICATION_RULES

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
logger.addHandler(console_handler)

# -----------------------------------------------------------------------------
# Main Logic
# -----------------------------------------------------------------------------
def export_subcat_definitions(output_path: str) -> None:
    """
    Reads classification logic from CLASSIFICATION_RULES, builds a mapping of Category -> sorted list of Subcategories, and writes as JSON to 'output_path'.
    """
    logger.info("Exporting subcat definitions to '%s'", output_path)

    category_map: Dict[str, Set[str]] = {}
    for tag_key, value_map in CLASSIFICATION_RULES.items():
        for osm_value, (cat_name, subcat_name) in value_map.items():
            if cat_name not in category_map:
                category_map[cat_name] = set()
            category_map[cat_name].add(subcat_name)

    category_json = {cat: sorted(subcats) for cat, subcats in category_map.items()}

    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(category_json, f, indent=2, ensure_ascii=False)
        logger.info("Subcat definitions successfully written to '%s'", output_path)
    except Exception as e:
        logger.error("Failed to write subcat definitions to '%s': %s", output_path, e)


def main():
    """
    Default command-line workflow: exports subcat definitions to a hardcoded path.
    """
    logger.info("Starting subcat definition export.")
    output_path = "public/data/subcat_definitions.json"
    export_subcat_definitions(output_path)
    logger.info("Done.")


# -----------------------------------------------------------------------------
# Entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    main()
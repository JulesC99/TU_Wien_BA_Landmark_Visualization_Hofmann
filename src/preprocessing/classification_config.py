# classification_config.py

"""
A centralized classification dictionary for OSM features.
Maps top-level keys like 'amenity', 'tourism', 'natural', etc. to a dict of their values -> (category, subcategory).
"""

CLASSIFICATION_RULES = {

    "amenity": {
        # Food & Drink
        "restaurant":      ("Food & Drink", "Restaurant"),
        "fast_food":       ("Food & Drink", "Fast Food"),
        "cafe":            ("Food & Drink", "Café"),
        "bar":             ("Food & Drink", "Bar"),
        "drinking_water":  ("Food & Drink", "Drinking Water"),
        "fountain":  ("Food & Drink", "Drinking Water"),

        # Emergency / Amenity
        "hospital":        ("Amenity", "Hospital"),
        "clinic":          ("Amenity", "Clinic"),
        "pharmacy":        ("Amenity", "Pharmacy"),
        "fuel":            ("Amenity", "Fuel"),
        "police":          ("Amenity", "Police"),
        "post_office":     ("Amenity", "Post Office"),
        "post_box":        ("Amenity", "Post Box"),
        "school":          ("Amenity", "School"),
        "university":      ("Amenity", "University"),
        "library":         ("Amenity", "Library"),
        "atm":             ("Amenity", "ATM"),
        "bank":            ("Amenity", "Bank"),
        "toilets":         ("Amenity", "Toilet"),
        "bench":           ("Amenity", "Bench"),
        "waste_basket":    ("Amenity", "Waste Basket"),
        "parking":         ("Amenity", "Parking"),
        "fire_extinguisher": ("Emergency", "Fire Extinguisher"), 
        "shelter": ("Accommodation", "Shelter"), 
    },

    "tourism": {
        # Accommodation
        "alpine_hut":      ("Accommodation", "Hut"),
        "wilderness_hut":  ("Accommodation", "Hut"),
        "chalet":          ("Accommodation", "Hut"),
        "hotel":           ("Accommodation", "Hotel"),
        "motel":           ("Accommodation", "Motel"),
        "hostel":          ("Accommodation", "Hostel"),
        "guest_house":     ("Accommodation", "Hostel"),

        # Tourism
        "information":     ("Tourism", "Information"),
        "artwork":         ("Tourism", "Art"),
        "attraction":      ("Tourism", "Attraction"),
        "monument":        ("Tourism", "Monument"),
        "museum":          ("Tourism", "Museum"),
        "statue":          ("Tourism", "Statue"),
        "viewpoint":       ("Tourism", "View Point"),
        "zoo":             ("Tourism", "Zoo"),
        "casino":          ("Tourism", "Casino"),
        "picnic_site":     ("Tourism", "Picnic Site"),
        "castle":          ("Tourism", "Castle"),
        "historic":        ("Tourism", "Historic"),
    },

    "shop": {
        # Shop
        "bakery":          ("Shop", "Bakery"),
        "butcher":         ("Shop", "Butcher"),
        "supermarket":     ("Shop", "Supermarket"),
        "jewelry":         ("Shop", "Jewellery"),
        "hairdresser":     ("Shop", "Hairdresser"),
        "shoes":           ("Shop", "Shoes"),
        "*":               ("Shop", "Misc Shops"), # does this work? lol
    },

    "place": {
        # Settlement
        "city":    ("Settlement", "City"),
        "town":    ("Settlement", "Town"),
        "village": ("Settlement", "Village"),
        "hamlet":  ("Settlement", "Hamlet"),
        "suburb":  ("Settlement", "Suburb"),
        "*":       ("Settlement", "Misc Settlements"),
    },

    "emergency": {
        "defibrillator":  ("Emergency", "Defibrillator"),
        "phone":          ("Emergency", "Phone"),
        "fire_extinguisher": ("Emergency", "Fire Extinguisher"),
    },

    "natural": {
        # Nature
        "peak":         ("Nature", "Peak"),
        "waterfall":    ("Nature", "Waterfall"),
        "tree":         ("Nature", "Tree"),
        "spring":       ("Nature", "Spring"),
        "cave_entrance":("Nature", "Cave"),
        "rock":         ("Nature", "Rock"),
        "glacier":      ("Nature", "Glacier"),
        "saddle":      ("Nature", "Mountain Pass"),
        "*":            ("Nature", "Misc Nature"),
    },

    "mountain_pass": {
        "yes": ("Nature", "Mountain Pass")
    },

    # Transport
    "railway": {
        "station":  ("Transportation", "Train Station"),
        "halt":     ("Transportation", "Train Stop"),
        "stop":     ("Transportation", "Train Stop"),
    },
    "highway": {
        "bus_stop":        ("Transportation", "Bus Stop"),
        "bus_station":     ("Transportation", "Bus Station"),
        "crossing":        ("Transportation", "Pedestrian Crossing"),
        "traffic_signals": ("Transportation", "Traffic Signals"),
    },
    "bus":{
        "yes": ("Transportation", "Bus Stop"),
    },

    # Infrastructure
    "barrier": {
        "gate": ("Infrastructure", "Gate"),
        "swing_gate": ("Infrastructure", "Gate"),
    },
    "ford": {
        "yes": ("Infrastructure", "Ford"),
    },
    "power": {
        "tower": ("Infrastructure", "Power"),
        "portal": ("Infrastructure", "Power"),
        "pole": ("Infrastructure", "Power"),
    },

    # Building
    "building": {
        "place_of_worship": ("Building", "Place of Worship"),
        "church":           ("Building", "Church"),
        "mosque":           ("Building", "Mosque"),
        "synagogue":        ("Building", "Synagogue"),
        "cemetery":         ("Building", "Cemetery"),
        "residential":      ("Building", "Residential"),
    },
}
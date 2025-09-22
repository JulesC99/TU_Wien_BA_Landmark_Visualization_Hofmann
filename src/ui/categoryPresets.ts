export const PRESET_KEY = {
  Hiking: 'hiking',
  Tourism: 'tourism',
  Emergency: 'emergency',
} as const;

export type PresetKey = typeof PRESET_KEY[keyof typeof PRESET_KEY];

export type SubcategoryTuple = [string, string];

export const PRESETS: Record<PresetKey, SubcategoryTuple[]> = {
  hiking: [
    ['Food & Drink', 'Drinking Water'],
    ['Amenity', 'Bench'],
    ['Amenity', 'Waste Basket'],
    ['Tourism', 'View Point'],
    ['Tourism', 'Picnic Site'],
    ['Nature', 'Tree'],
    ['Nature', 'Peak'],
  ],
  tourism: [
    ['Food & Drink', 'Restaurant'],
    ['Accommodation', 'Hotel'],
    ['Tourism', 'Attraction'],
    ['Tourism', 'Historic'],
    ['Tourism', 'Information'],
    ['Tourism', 'View Point'],
    ['Tourism', 'Museum'],
    ['Tourism', 'Monument'],
  ],
  emergency: [
    ['Food & Drink', 'Drinking Water'],
    ['Amenity', 'Toilet'],
    ['Amenity', 'Police'],
    ['Emergency', 'Defibrillator'],
    ['Emergency', 'Phone'],
    ['Accommodation', 'Shelter'],
  ],
};

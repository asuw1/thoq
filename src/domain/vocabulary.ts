/**
 * The shared taste vocabulary. Places carry these tags, onboarding asks
 * about them, and visit logs reinforce them — which is what lets the
 * recommender compare a user to a place without any text understanding.
 */

export type TagGroup = { id: string; title: string; kind: 'cafe' | 'restaurant' | 'both'; tags: { id: string; label: string }[] };

export const TAG_GROUPS: TagGroup[] = [
  {
    id: 'coffee',
    title: 'Coffee',
    kind: 'cafe',
    tags: [
      { id: 'pour-over', label: 'Pour-over' },
      { id: 'espresso', label: 'Espresso' },
      { id: 'light-roast', label: 'Light roasts' },
      { id: 'saudi-coffee', label: 'Saudi coffee' },
      { id: 'cold-brew', label: 'Cold brew' },
      { id: 'roastery', label: 'Roasts in-house' },
    ],
  },
  {
    id: 'food',
    title: 'Food',
    kind: 'restaurant',
    tags: [
      { id: 'saudi', label: 'Saudi / Najdi' },
      { id: 'levantine', label: 'Levantine' },
      { id: 'japanese', label: 'Japanese' },
      { id: 'italian', label: 'Italian' },
      { id: 'indian', label: 'Indian' },
      { id: 'burgers', label: 'Burgers' },
      { id: 'seafood', label: 'Seafood' },
      { id: 'grill', label: 'Grill' },
      { id: 'breakfast', label: 'Breakfast' },
    ],
  },
  {
    id: 'bakery',
    title: 'Bakes',
    kind: 'both',
    tags: [
      { id: 'pastry', label: 'Pastry' },
      { id: 'sourdough', label: 'Sourdough' },
      { id: 'desserts', label: 'Desserts' },
    ],
  },
  {
    id: 'room',
    title: 'The room',
    kind: 'both',
    tags: [
      { id: 'quiet', label: 'Quiet' },
      { id: 'lively', label: 'Lively' },
      { id: 'laptop', label: 'Laptop-friendly' },
      { id: 'outdoor', label: 'Outdoor seating' },
      { id: 'date', label: 'Date night' },
      { id: 'family', label: 'Family sections' },
      { id: 'late', label: 'Open late' },
      { id: 'counter', label: 'Counter / bar seating' },
    ],
  },
];

export const TAG_LABEL: Record<string, string> = Object.fromEntries(
  TAG_GROUPS.flatMap((g) => g.tags.map((t) => [t.id, t.label])),
);

export type Area = { name: string; lat: number; lng: number };

/** Riyadh neighbourhoods used as the "from" point for distance. No GPS needed for the MVP. */
export const AREAS: Area[] = [
  { name: 'Al Olaya', lat: 24.6937, lng: 46.6853 },
  { name: 'As Sulimaniyah', lat: 24.705, lng: 46.7 },
  { name: 'Al Malqa', lat: 24.812, lng: 46.613 },
  { name: 'Hittin', lat: 24.764, lng: 46.605 },
  { name: 'Al Nakheel', lat: 24.753, lng: 46.64 },
  { name: 'KAFD', lat: 24.764, lng: 46.64 },
  { name: 'Al Yasmin', lat: 24.826, lng: 46.642 },
  { name: 'Diriyah', lat: 24.734, lng: 46.575 },
  { name: 'Al Rawdah', lat: 24.73, lng: 46.77 },
  { name: 'Al Murabba', lat: 24.645, lng: 46.711 },
];

export function areaByName(name: string): Area {
  return AREAS.find((a) => a.name === name) ?? AREAS[0];
}

export const PRICE_LABEL: Record<number, string> = { 1: '<40', 2: '40–90', 3: '90–180', 4: '180+' };

/** Upper bound shown on the budget filter, e.g. "≤ SAR 90". */
export const PRICE_CAP: Record<number, string> = { 1: '≤ SAR 40', 2: '≤ SAR 90', 3: '≤ SAR 180', 4: 'Any' };

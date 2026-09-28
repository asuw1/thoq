/** Cafés and restaurants are ranked separately: comparing a flat white to a mandi is not a useful question. */
export type Kind = 'cafe' | 'restaurant';

/** 1 = under SAR 40 per person, 2 = 40–90, 3 = 90–180, 4 = 180+. */
export type PriceLevel = 1 | 2 | 3 | 4;

export type Hours = {
  /** Minutes after local midnight. `close` may be less than `open` when a place runs past midnight. */
  open: number;
  close: number;
};

export type Place = {
  id: string;
  name: string;
  nameAr: string;
  kind: Kind;
  /** One-line description of what the place is, e.g. "Specialty roastery". */
  category: string;
  area: string;
  lat: number;
  lng: number;
  price: PriceLevel;
  hours: Hours;
  /** Taste features. Drawn from TAGS so they are comparable across places and users. */
  tags: string[];
  /** Things people typically order; logs pick from these. */
  menu: string[];
};

/** How a visit felt, before any comparison refines it. Sets the score band. */
export type Reaction = 'loved' | 'fine' | 'disliked';

export type Visit = {
  id: string;
  userId: string;
  placeId: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  reaction: Reaction;
  ordered: string[];
  note: string;
};

export type User = {
  id: string;
  name: string;
  handle: string;
  area: string;
  bio: string;
};

/** Best first. Scores are derived from position, never stored. */
export type Rankings = Record<Kind, string[]>;

export type PlaceList = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  placeIds: string[];
};

import { tasteFit } from '../reco/engine';
import { normalise, type RankEntry } from '../reco/ranking';
import { PLACES } from './seed-places';
import type { Kind, PlaceList, Reaction, User, Visit } from './types';

/**
 * Fictional community used until there is a backend. Each person has a taste
 * persona; their visits and rankings are generated deterministically from it,
 * so the collaborative filter has real structure to find.
 */

type Persona = User & { taste: Record<string, number>; visits: number };

const PERSONAS: Persona[] = [
  { id: 'u-nora', name: 'Nora', handle: 'nora.brews', area: 'Al Malqa', bio: 'Filter coffee, notebooks, early mornings.', visits: 16,
    taste: { 'pour-over': 1, 'light-roast': 0.9, roastery: 0.7, quiet: 0.8, laptop: 0.5, lively: -0.6, 'saudi-coffee': 0.2, japanese: 0.5 } },
  { id: 'u-faisal', name: 'Faisal', handle: 'faisal.eats', area: 'Hittin', bio: 'Mandi on Fridays, ramen on Tuesdays.', visits: 15,
    taste: { saudi: 1, grill: 0.8, japanese: 0.6, late: 0.6, burgers: 0.5, quiet: -0.2, 'pour-over': -0.3 } },
  { id: 'u-reem', name: 'Reem', handle: 'reem.r', area: 'As Sulimaniyah', bio: 'Pastry person. Will cross the city for laminated dough.', visits: 14,
    taste: { pastry: 1, sourdough: 0.9, breakfast: 0.7, desserts: 0.6, outdoor: 0.4, espresso: 0.4, burgers: -0.5 } },
  { id: 'u-omar', name: 'Omar', handle: 'omar.k', area: 'KAFD', bio: 'Espresso, then work. Counter seats only.', visits: 14,
    taste: { espresso: 1, counter: 0.8, laptop: 0.7, quiet: 0.4, japanese: 0.5, grill: 0.3, family: -0.4 } },
  { id: 'u-lama', name: 'Lama', handle: 'lama.eats', area: 'Al Yasmin', bio: 'Date nights and long dinners.', visits: 13,
    taste: { date: 1, italian: 0.8, levantine: 0.7, outdoor: 0.6, desserts: 0.5, laptop: -0.5, 'cold-brew': 0.2 } },
  { id: 'u-yousef', name: 'Yousef', handle: 'yousef.q', area: 'Diriyah', bio: 'Qahwa, dates and a good majlis.', visits: 12,
    taste: { 'saudi-coffee': 1, saudi: 0.9, family: 0.6, outdoor: 0.6, desserts: 0.4, espresso: -0.3 } },
  { id: 'u-hessa', name: 'Hessa', handle: 'hessa.h', area: 'Al Nakheel', bio: 'Light roasts, quiet corners, long reads.', visits: 14,
    taste: { 'pour-over': 0.9, 'light-roast': 0.8, quiet: 1, pastry: 0.4, lively: -0.7, laptop: 0.5 } },
  { id: 'u-khalid', name: 'Khalid', handle: 'khalid.late', area: 'Al Olaya', bio: 'Anything open after midnight.', visits: 13,
    taste: { late: 1, burgers: 0.8, lively: 0.7, 'cold-brew': 0.6, japanese: 0.4, quiet: -0.5 } },
  { id: 'u-dana', name: 'Dana', handle: 'dana.d', area: 'Al Murabba', bio: 'Spice first. South Indian breakfasts forever.', visits: 12,
    taste: { indian: 1, breakfast: 0.7, levantine: 0.5, family: 0.3, grill: 0.4, italian: -0.2 } },
  { id: 'u-turki', name: 'Turki', handle: 'turki.roasts', area: 'Al Yasmin', bio: 'Home roaster. Opinions on grind size.', visits: 15,
    taste: { roastery: 1, 'pour-over': 0.9, 'light-roast': 1, counter: 0.6, 'cold-brew': 0.4, desserts: -0.3 } },
  { id: 'u-maha', name: 'Maha', handle: 'maha.m', area: 'Hittin', bio: 'Seafood, sunsets, big tables.', visits: 12,
    taste: { seafood: 1, family: 0.7, outdoor: 0.8, levantine: 0.5, grill: 0.5, counter: -0.3 } },
  { id: 'u-sami', name: 'Sami', handle: 'sami.s', area: 'Al Rawdah', bio: 'Cheap, fast, good. In that order.', visits: 13,
    taste: { burgers: 0.9, saudi: 0.7, late: 0.6, espresso: 0.4, family: 0.4, date: -0.4 } },
];

export const SEED_USERS: User[] = PERSONAS.map(({ taste: _t, visits: _v, ...u }) => u);

/** Small, fast, deterministic PRNG so every install sees the same community. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A place's intrinsic quality, independent of taste. Some places are just better. */
const QUALITY: Record<string, number> = {
  nabta: 0.9, ghaf: 0.8, 'sakura-counter': 1, 'najd-table': 0.7, qirtas: 0.6, kiln: 0.5, press: 0.6,
  'ramen-dori': 0.6, sukkar: 0.5, 'bunn-station': -0.8, 'rawda-corner': -0.4, 'dune-burger': -0.3,
  'smash-lab': 0.3, 'dosa-point': 0.4, ember: 0.5, saqf: -0.2, lail: 0, 'majlis-beans': 0.7,
};

const TAG_LINES: Record<string, string[]> = {
  'pour-over': ['They weigh every pour.', 'Recipes are dialled in per origin.'],
  'light-roast': ['Roasts are light and bright, not sour.', 'Fruit-forward without being thin.'],
  roastery: ['You can smell the roaster from the door.', 'Bags roasted this week.'],
  espresso: ['Shots pulled tight and consistent.', 'Milk texture is exactly right.'],
  'saudi-coffee': ['Proper qahwa, cardamom-heavy.', 'Served with dates, as it should be.'],
  'cold-brew': ['Cold brew is smooth, not muddy.'],
  quiet: ['Quiet enough to read.', 'No music war with the next table.'],
  lively: ['Loud in a good way.', 'Always busy, always moving.'],
  laptop: ['Plugs at most tables.', 'Stayed three hours, nobody minded.'],
  outdoor: ['Sit outside after sunset.', 'Terrace is the move in winter.'],
  late: ['Still full at 1am.', 'Good after a late night.'],
  counter: ['Sit at the bar and watch them work.'],
  date: ['Dim, calm, good for a long dinner.'],
  family: ['Family section is spacious.'],
  pastry: ['Lamination is serious.', 'Get there before 10 for the full case.'],
  sourdough: ['Take a loaf home.'],
  desserts: ['Save room for dessert.'],
  breakfast: ['Best before noon.'],
  saudi: ['Tastes like a home kitchen.', 'Generous portions.'],
  japanese: ['Rice is seasoned properly.', 'Broth has real depth.'],
  italian: ['Pasta is cooked properly al dente.'],
  levantine: ['Mezze arrive fast and keep coming.'],
  indian: ['Spice level is honest.'],
  burgers: ['Crust on the patty is perfect.'],
  seafood: ['Fish tastes like it came in this morning.'],
  grill: ['Charcoal flavour all the way through.'],
};

const LEADS: Record<Reaction, string[]> = {
  loved: ['Get the {item}.', 'The {item} alone is worth the drive.', '{item}, every time.', 'Came for the {item}, stayed an hour.'],
  fine: ['{item} was decent.', 'Solid {item}, nothing memorable.', 'The {item} was fine; the room did more work.'],
  disliked: ['{item} was a miss.', 'Wanted to like the {item}.', 'Overpriced {item}.'],
};

function note(rand: () => number, reaction: Reaction, item: string, tags: string[]): string {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const lead = pick(LEADS[reaction]).replace('{item}', item);
  const lead2 = lead.charAt(0).toUpperCase() + lead.slice(1);
  if (reaction === 'disliked') return lead2;
  const lines = tags.flatMap((t) => TAG_LINES[t] ?? []);
  return lines.length ? `${lead2} ${pick(lines)}` : lead2;
}

export type SeedCommunity = {
  users: User[];
  visits: Visit[];
  rankings: Record<string, Record<Kind, RankEntry[]>>;
  lists: PlaceList[];
};

function isoDaysAgo(today: Date, days: number): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days));
  return d.toISOString().slice(0, 10);
}

export function buildCommunity(today: Date): SeedCommunity {
  const visits: Visit[] = [];
  const rankings: SeedCommunity['rankings'] = {};

  PERSONAS.forEach((persona, pi) => {
    const rand = mulberry32(1000 + pi * 97);
    // Prefer places that fit, but everyone tries a few things outside their lane.
    const pool = PLACES.map((pl) => ({ pl, pull: tasteFit(persona.taste, pl) + rand() * 0.9 }))
      .sort((a, b) => b.pull - a.pull)
      .slice(0, persona.visits);

    const scored = pool.map(({ pl }) => {
      const latent = 5.6 + 3.4 * tasteFit(persona.taste, pl) + (QUALITY[pl.id] ?? 0) + (rand() - 0.5) * 1.6;
      const reaction: Reaction = latent >= 6.8 ? 'loved' : latent >= 4.2 ? 'fine' : 'disliked';
      return { pl, latent, reaction };
    });

    const byKind: Record<Kind, RankEntry[]> = { cafe: [], restaurant: [] };
    for (const kind of ['cafe', 'restaurant'] as Kind[]) {
      byKind[kind] = normalise(
        scored
          .filter((s) => s.pl.kind === kind)
          .sort((a, b) => b.latent - a.latent)
          .map((s) => ({ placeId: s.pl.id, reaction: s.reaction })),
      );
    }
    rankings[persona.id] = byKind;

    scored.forEach(({ pl, reaction }, vi) => {
      const item = pl.menu[Math.floor(rand() * pl.menu.length)];
      visits.push({
        id: `v-${persona.id}-${pl.id}`,
        userId: persona.id,
        placeId: pl.id,
        date: isoDaysAgo(today, Math.floor(rand() * 90) + (vi % 3)),
        reaction,
        ordered: [item],
        note: rand() < 0.75 ? note(rand, reaction, item, pl.tags) : '',
      });
    });
  });

  const lists: PlaceList[] = [
    { id: 'l-nora-filter', ownerId: 'u-nora', title: 'Filter coffee worth the drive', description: 'Places that brew to a recipe, not a button.', placeIds: ['nabta', 'ghaf', 'press', 'hijra', 'majlis-beans'] },
    { id: 'l-khalid-late', ownerId: 'u-khalid', title: 'After midnight', description: 'Still serving when everything else is closed.', placeIds: ['lail', 'smash-lab', 'mandi-alley', 'saqf', 'izakaya-kumo', 'dune-burger'] },
    { id: 'l-reem-bakes', ownerId: 'u-reem', title: 'Laminated dough, ranked', description: 'Croissants and friends.', placeIds: ['qirtas', 'sukkar', 'kiln', 'cardamom'] },
    { id: 'l-omar-work', ownerId: 'u-omar', title: 'Two-hour work sessions', description: 'Good espresso, plugs, and no one hovering.', placeIds: ['mirkaz', 'studio-9', 'nabta', 'warraq', 'hijra'] },
  ];

  visits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { users: SEED_USERS, visits, rankings, lists };
}

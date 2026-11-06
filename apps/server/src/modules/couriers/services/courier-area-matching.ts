import { CourierAreaMatch } from '@lytronix/validators';
import type { ZillaView } from '../../delivery/types/delivery';

/** Where one of a courier's areas goes among Lytro's zillas and thanas. */
export interface AreaPlace {
  zillaId: number | null;
  thanaId: number | null;
  suggestedThanaId: number | null;
  match: CourierAreaMatch;
}

// Couriers write some districts the older way, and a few in short.
const DISTRICT_SPELLINGS: Readonly<Record<string, string>> = {
  chittagong: 'chattogram',
  barisal: 'barishal',
  bogra: 'bogura',
  'b baria': 'brahmanbaria',
  comilla: 'cumilla',
  jessore: 'jashore',
  gopalgonj: 'gopalganj',
  jhalokathi: 'jhalokati',
  jhenidah: 'jhenaidah',
  khagrachari: 'khagrachhari',
  munsiganj: 'munshiganj',
  narshingdi: 'narsingdi',
  netrakona: 'netrokona',
  maulvibazar: 'moulvibazar',
  'chapai nawabganj': 'chapainawabganj',
  nawabganj: 'chapainawabganj',
  sirajgonj: 'sirajganj',
};
// Words that say what kind of place a name is, not which.
const KIND_WORDS =
  /\b(sadar|thana|upazila|city|corporation|municipality|pourashava|model|police station|ps|bazar|road|area|para|union)\b/g;
const CLOSE_DISTRICT = 0.8;
const CLOSE_THANA = 0.88;

/** A place's name as compared: lower case, letters only, its bracketed part, numbers and kind words left out. */
export function plainName(words: string): string {
  return words
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9() ]+/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(KIND_WORDS, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What is in a name's brackets, each part as compared: "Kakoli(Banani)" gives "banani". */
function bracketed(words: string): string[] {
  return [...words.matchAll(/\(([^)]*)\)/g)].map((found) => plainName(found[1] ?? ''));
}

/** One Bangla name romanised two ways reads the same: gonj and ganj, bagh and bag, a doubled letter and one. */
function spelledAlike(words: string): string {
  return words
    .replace(/gonj/g, 'ganj')
    .replace(/bagh/g, 'bag')
    .replace(/oo/g, 'u')
    .replace(/ee/g, 'i')
    .replace(/kh/g, 'k')
    .replace(/sh/g, 's')
    .replace(/w/g, 'o')
    .replace(/(.)\1+/g, '$1')
    .replace(/ /g, '');
}

/** How alike two names are, from 0 to 1, by the edits between them. */
export function likeness(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return 1 - (previous[b.length] ?? 0) / Math.max(a.length, b.length);
}

function closest(name: string, among: string[], least: number): string | null {
  let best: string | null = null;
  let score = least;
  for (const candidate of among) {
    const alike = likeness(name, candidate);
    if (alike >= score) {
      best = candidate;
      score = alike;
    }
  }
  return best;
}

/**
 * CUS-10 (Phase 6 Slice 6.4, read agreed 2026-11-06): where a courier's area goes. Its district finds the zilla, so it can always be
 * searched there. It counts in a thana only when it is named after it: the same name, the name and then more ("Mirpur 10"), or the
 * same name romanised another way. A thana named only in its brackets, or a near spelling, is a suggestion for the operator, since
 * "Duaripara-Pallabi(Mirpur 12)" names Mirpur though it is in Pallabi. Shared post codes were tried and left out: most areas have none.
 */
export class CourierAreaMatcher {
  private readonly zillas: Map<string, ZillaView>;

  constructor(zillas: readonly ZillaView[]) {
    this.zillas = new Map(zillas.map((zilla) => [plainName(zilla.nameEn), zilla]));
  }

  place(area: { name: string; districtName: string }): AreaPlace {
    const zilla = this.zillaOf(area.districtName);
    if (!zilla)
      return { zillaId: null, thanaId: null, suggestedThanaId: null, match: CourierAreaMatch.None };
    const thanas = new Map(zilla.thanas.map((thana) => [plainName(thana.nameEn), thana.id]));
    const own = this.named(plainName(area.name), thanas);
    if (own !== null) {
      return {
        zillaId: zilla.id,
        thanaId: own,
        suggestedThanaId: null,
        match: CourierAreaMatch.OwnName,
      };
    }
    const suggested =
      bracketed(area.name)
        .map((part) => this.named(part, thanas))
        .find((found) => found !== null) ?? this.nearly(plainName(area.name), thanas);
    return suggested === null
      ? { zillaId: zilla.id, thanaId: null, suggestedThanaId: null, match: CourierAreaMatch.None }
      : {
          zillaId: zilla.id,
          thanaId: null,
          suggestedThanaId: suggested,
          match: CourierAreaMatch.Suggested,
        };
  }

  private zillaOf(district: string): ZillaView | null {
    const plain = plainName(district);
    const key = DISTRICT_SPELLINGS[plain] ?? plain;
    const exact = this.zillas.get(key);
    if (exact) return exact;
    const near = closest(key, [...this.zillas.keys()], CLOSE_DISTRICT);
    return near === null ? null : (this.zillas.get(near) ?? null);
  }

  private named(name: string, thanas: Map<string, number>): number | null {
    if (name === '') return null;
    const exact = thanas.get(name);
    if (exact !== undefined) return exact;
    const starts = [...thanas.keys()].filter(
      (key) => key !== '' && (name.startsWith(`${key} `) || key.startsWith(`${name} `)),
    );
    if (starts.length === 1) return thanas.get(starts[0] ?? '') ?? null;
    const alike = spelledAlike(name);
    const same = [...thanas.keys()].filter((key) => spelledAlike(key) === alike);
    return same.length === 1 ? (thanas.get(same[0] ?? '') ?? null) : null;
  }

  private nearly(name: string, thanas: Map<string, number>): number | null {
    if (name === '') return null;
    const near = closest(name, [...thanas.keys()], CLOSE_THANA);
    return near === null ? null : (thanas.get(near) ?? null);
  }
}

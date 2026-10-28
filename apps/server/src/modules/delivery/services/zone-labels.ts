import type { Bilingual, HomeAreaKind, ZoneAreasView } from '../types/delivery';

// DLV-01: the home and fallback zones are named after the home area until the tenant names them ("Inside Dhaka
// city", "Outside Dhaka city"). Built per language, since a shop's shoppers read Bangla and its staff either.

/** The home area as one phrase, with the Bangla possessive form the zone names need ("ঢাকা সিটির"). */
interface AreaPhrase {
  en: string;
  bn: string;
  bnOf: string;
}

function listed(names: string[], and: string, more: (count: number) => string): string {
  if (names.length <= 2) return names.join(` ${and} `);
  return `${names.slice(0, 2).join(', ')} ${and} ${more(names.length - 2)}`;
}

/** DLV-01: a city, a district, or the tenant's own thanas, named as the delivery settings show it. */
export function homeAreaPhrase(kind: HomeAreaKind, areas: ZoneAreasView): AreaPhrase {
  if (kind === 'city') {
    const city = areas.cities[0];
    const en = city?.nameEn ?? 'your city';
    const bn = city?.nameBn ?? 'আপনার সিটি';
    return { en, bn, bnOf: `${bn}র` };
  }
  if (kind === 'zilla') {
    const zilla = areas.zillas[0];
    const en = `${zilla?.nameEn ?? 'your'} district`;
    const bn = `${zilla?.nameBn ?? 'আপনার'} জেলা`;
    return { en, bn, bnOf: `${bn}র` };
  }
  const en = listed(
    areas.thanas.map((thana) => thana.nameEn),
    'and',
    (count) => `${String(count)} more`,
  );
  const bn = listed(
    areas.thanas.map((thana) => thana.nameBn),
    'ও',
    (count) => `আরও ${String(count)}টি`,
  );
  return { en, bn, bnOf: `${bn} এলাকার` };
}

/** "Inside <home area>" or "Outside <home area>", in both languages. */
export function zoneLabel(place: 'inside' | 'outside', phrase: AreaPhrase): Bilingual {
  return place === 'inside'
    ? { en: `Inside ${phrase.en}`, bn: `${phrase.bnOf} ভেতরে` }
    : { en: `Outside ${phrase.en}`, bn: `${phrase.bnOf} বাইরে` };
}

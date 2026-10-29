import { useTranslation } from 'react-i18next';
import type { DeliverySettings, DeliveryZone, Locations, ResolvedZone } from '@/types/delivery';
import type { Bilingual } from '@/types/onboarding';
import { thanaOf, type AreaRef } from './areas';

/** How Delivery reads in the person's language: areas, zones, and why an address matched. */
export function useDeliveryWords() {
  const { t, i18n } = useTranslation('shop');
  const bn = i18n.language === 'bn';
  const named = (each: { nameEn: string; nameBn: string }): string =>
    bn ? each.nameBn : each.nameEn;

  /** An area as a chip names it: "Chattogram city", "Gazipur district", "Banani". */
  const area = (locations: Locations, ref: AreaRef): string => {
    if (ref.kind === 'city') {
      const city = locations.cities.find((each) => each.code === ref.code);
      return city ? named(city) : ref.code;
    }
    if (ref.kind === 'zilla') {
      const zilla = locations.zillas.find((each) => each.id === ref.id);
      return zilla ? t('districtName', { name: named(zilla) }) : '';
    }
    const found = thanaOf(locations, ref.id);
    return found ? named(found.thana) : '';
  };

  /** A name the server gives in both languages (the home area, a zone's label). */
  const label = (each: Bilingual): string => (bn ? each.bn : each.en);

  /** A thana as Check an address's field writes it, under "District and thana": "Chattogram · Panchlaish". */
  const districtAndThana = (locations: Locations, id: number): string => {
    const found = thanaOf(locations, id);
    return found ? `${named(found.zilla)} · ${named(found.thana)}` : '';
  };

  /** A zone's name: the shop's own, or the one built from the home area. */
  const zone = (each: DeliveryZone): string => label(each.label);

  /** A zone's areas in one line, as its row shows them: "Chattogram city · Sylhet city". */
  const areasLine = (each: DeliveryZone): string =>
    [
      ...each.areas.cities.map(named),
      ...each.areas.zillas.map(named),
      ...each.areas.thanas.map(named),
    ].join(' · ');

  /** Why an address fell in its zone (Check an address). */
  const matched = (by: ResolvedZone['matchedBy']): string =>
    t(
      by === 'thana'
        ? 'matchedThana'
        : by === 'city'
          ? 'matchedCity'
          : by === 'zilla'
            ? 'matchedDistrict'
            : 'matchedElse',
    );

  /**
   * A fixed zone's automatic name for a home area named `area` in this language, built the way the server builds it
   * (apps/server/src/modules/delivery/services/zone-labels.ts): "Inside Dhaka city", "ঢাকা সিটির ভেতরে", "মিরপুর ও
   * পল্লবী এলাকার ভেতরে". The rename sheet's "Use the automatic name" and the home area's preview read it.
   */
  const automatic = (
    kind: DeliverySettings['homeArea']['kind'],
    area: string,
    place: 'inside' | 'outside',
  ): string => {
    if (!bn) return `${place === 'inside' ? 'Inside' : 'Outside'} ${area}`;
    const of = kind === 'thanas' ? `${area} এলাকার` : `${area}র`;
    return `${of} ${place === 'inside' ? 'ভেতরে' : 'বাইরে'}`;
  };

  /** The shop's own thanas as one name, as the server lists them: "Mirpur, Pallabi and 1 more". */
  const listed = (names: readonly string[]): string => {
    const and = bn ? 'ও' : 'and';
    if (names.length <= 2) return names.join(` ${and} `);
    const more = names.length - 2;
    return `${names.slice(0, 2).join(', ')} ${and} ${bn ? `আরও ${String(more)}টি` : `${String(more)} more`}`;
  };

  return { area, districtAndThana, label, zone, areasLine, matched, automatic, listed };
}

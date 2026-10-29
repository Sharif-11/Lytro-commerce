import type {
  AreasInput,
  DeliverySettings,
  DeliveryZone,
  Locations,
  Thana,
  ZoneAreasView,
} from '@/types/delivery';

/** One area of a zone (DLV-01): a city area by its code, a zilla or a thana by its id. */
export type AreaRef =
  { kind: 'city'; code: string } | { kind: 'zilla'; id: number } | { kind: 'thana'; id: number };

/** An area's key, the same for the same area. */
export const areaKey = (ref: AreaRef): string =>
  ref.kind === 'city' ? `c:${ref.code}` : `${ref.kind === 'zilla' ? 'z' : 't'}:${String(ref.id)}`;

/** A zone's areas as refs: cities, then districts, then thanas. */
export const refsOf = (areas: ZoneAreasView): AreaRef[] => [
  ...areas.cities.map((city): AreaRef => ({ kind: 'city', code: city.code })),
  ...areas.zillas.map((zilla): AreaRef => ({ kind: 'zilla', id: zilla.id })),
  ...areas.thanas.map((thana): AreaRef => ({ kind: 'thana', id: thana.id })),
];

/** The areas as a write sends them. */
export const inputOf = (refs: readonly AreaRef[]): AreasInput => ({
  cityCodes: refs.flatMap((ref) => (ref.kind === 'city' ? [ref.code] : [])),
  zillaIds: refs.flatMap((ref) => (ref.kind === 'zilla' ? [ref.id] : [])),
  locationIds: refs.flatMap((ref) => (ref.kind === 'thana' ? [ref.id] : [])),
});

/** The same areas, in any order. */
export const sameRefs = (a: readonly AreaRef[], b: readonly AreaRef[]): boolean =>
  a.length === b.length && a.every((ref) => b.some((other) => areaKey(other) === areaKey(ref)));

/** A thana of the canonical list with the zilla it is in. */
export function thanaOf(
  locations: Locations,
  id: number,
): { thana: Thana; zilla: Locations['zillas'][number] } | null {
  for (const zilla of locations.zillas) {
    const thana = zilla.thanas.find((each) => each.id === id);
    if (thana) return { thana, zilla };
  }
  return null;
}

/** DLV-02: the zone that holds exactly this area, other than the one being edited; an area sits in one zone only. */
export function holderOf(
  settings: DeliverySettings,
  ref: AreaRef,
  exceptZoneId: string | null,
): DeliveryZone | null {
  return (
    settings.zones.find(
      (zone) =>
        zone.id !== exceptZoneId && refsOf(zone.areas).some((own) => areaKey(own) === areaKey(ref)),
    ) ?? null
  );
}

/**
 * DLV-02: the zone a thana falls in today by its city or its district, when no zone names the thana itself; picked
 * into another zone, it moves from there (a thana beats its city, a city its district).
 */
export function coverOf(
  settings: DeliverySettings,
  locations: Locations,
  thanaId: number,
  exceptZoneId: string | null,
): { zone: DeliveryZone; by: 'city' | 'zilla' } | null {
  const found = thanaOf(locations, thanaId);
  if (!found) return null;
  const cityCode = found.thana.cityCode;
  if (cityCode !== null) {
    const byCity = holderOf(settings, { kind: 'city', code: cityCode }, exceptZoneId);
    if (byCity) return { zone: byCity, by: 'city' };
  }
  const byZilla = holderOf(settings, { kind: 'zilla', id: found.zilla.id }, exceptZoneId);
  return byZilla ? { zone: byZilla, by: 'zilla' } : null;
}

/** Words that match a typed search, in either language, ignoring case. */
export const matches = (typed: string, ...names: string[]): boolean => {
  const query = typed.trim().toLowerCase();
  return query === '' || names.some((name) => name.toLowerCase().includes(query));
};

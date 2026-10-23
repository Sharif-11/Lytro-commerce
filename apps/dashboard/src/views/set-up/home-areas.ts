import type { HomeAreaInput, Locations } from '@/types/onboarding';

/** A home area set-up can pick (DLV-01): one city area, or one zilla. A shop's own thanas are set in Delivery. */
export type HomeArea = { kind: 'city'; code: string } | { kind: 'zilla'; id: number };

/** The area every shop starts with (the server's default zones, DLV-01). */
export const DEFAULT_HOME_AREA: HomeArea = { kind: 'city', code: 'dhaka' };

// The prototype's eight chips: the five largest city areas, then three busy districts near them. Every other city
// and district is a search away.
const FEATURED_CITIES = ['dhaka', 'chattogram', 'sylhet', 'khulna', 'rajshahi'];
const FEATURED_ZILLAS = ['gazipur', 'narayanganj', 'cumilla'];

export function sameArea(a: HomeArea, b: HomeArea): boolean {
  return a.kind === 'city'
    ? b.kind === 'city' && a.code === b.code
    : b.kind === 'zilla' && a.id === b.id;
}

/** The chips set-up shows before any search, in the prototype's order. */
export function featuredAreas(locations: Locations): HomeArea[] {
  const cities = FEATURED_CITIES.filter((code) =>
    locations.cities.some((city) => city.code === code),
  ).map((code): HomeArea => ({ kind: 'city', code }));
  const zillas = FEATURED_ZILLAS.flatMap((name): HomeArea[] => {
    const zilla = locations.zillas.find((each) => each.nameEn.toLowerCase() === name);
    return zilla ? [{ kind: 'zilla', id: zilla.id }] : [];
  });
  return [...cities, ...zillas];
}

/** PUT /delivery-zones/home-area's body for one city or one zilla. */
export function homeAreaInput(area: HomeArea): HomeAreaInput {
  return {
    areas:
      area.kind === 'city'
        ? { cityCodes: [area.code], zillaIds: [], locationIds: [] }
        : { cityCodes: [], zillaIds: [area.id], locationIds: [] },
  };
}

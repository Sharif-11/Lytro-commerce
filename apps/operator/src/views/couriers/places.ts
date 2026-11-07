import { CourierAdapterState } from '@lytronix/validators';
import type { LocationThana, LocationZilla, OperatorCourier } from '@/types/couriers';

export interface PlacedThana {
  thana: LocationThana;
  zilla: LocationZilla;
}

/** A thana and its zilla by the thana's id, from the list the shops' address forms read. */
export function thanaIndex(zillas: LocationZilla[]): Map<number, PlacedThana> {
  const found = new Map<number, PlacedThana>();
  for (const zilla of zillas) {
    for (const thana of zilla.thanas) found.set(thana.id, { thana, zilla });
  }
  return found;
}

/** A place's name in the language shown. */
export function placeName(place: { nameEn: string; nameBn: string }, language: string): string {
  return language === 'bn' ? place.nameBn : place.nameEn;
}

/** The couriers a retiring one can suggest instead: the other active ones (Slice 6.6 read 1). */
export function suggestionsFor(
  courier: OperatorCourier,
  couriers: OperatorCourier[],
): OperatorCourier[] {
  return couriers.filter(
    (each) => each.key !== courier.key && each.state === CourierAdapterState.Active,
  );
}

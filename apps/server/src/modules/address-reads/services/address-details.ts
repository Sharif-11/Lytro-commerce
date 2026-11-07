import {
  AddressFieldState,
  bdMobileNumber,
  CourierAreaMatch,
  CUSTOMER_NAME_MAX_LENGTH,
  ORDER_ADDRESS_MAX_LENGTH,
  ORDER_NOTES_MAX_LENGTH,
  type AddressRead,
} from '@lytronix/validators';
import type { PlaceMatcher } from '../../delivery/services/place-matching';
import type { ReadDetails } from '../ports/address-reader';

/** A read's details as the order form takes them, before anything is charged. */
export type ShapedRead = Omit<AddressRead, 'charged'>;

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bangla digits written as Latin ones: "০১৭১১" reads as "01711". Everything else as it was. */
export function latinDigits(text: string): string {
  return text.replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
}

/** A detail cut to what its field on the order form holds. */
function within(value: string | null, most: number): string | null {
  return value === null ? null : Array.from(value).slice(0, most).join('');
}

// ORD-30: how much each of the five details adds to the read's confidence.
const WEIGHT: Record<AddressFieldState, number> = {
  [AddressFieldState.Found]: 1,
  [AddressFieldState.Check]: 0.5,
  [AddressFieldState.Missing]: 0,
};

/**
 * ORD-30, ORD-31 (amended 2026-11-06, Slice 7.6's read): the details as the order form takes them. A phone is
 * Lytro's own form of a mobile number, or left for staff when it isn't one. The zilla and thana are matched to
 * Lytro's list by name with the couriers' spelling rules: a thana by its own name is found, a near one is filled in to
 * check, and none is missing. Confidence is how much of name, phone, zilla, thana and address was read and matched.
 */
export function shapeRead(details: ReadDetails, places: PlaceMatcher): ShapedRead {
  const phone = details.phone === null ? null : bdMobileNumber(latinDigits(details.phone));
  const place = places.place({ name: details.thana ?? '', districtName: details.zilla ?? '' });
  const fields: ShapedRead['fields'] = {
    customerName: details.name === null ? AddressFieldState.Missing : AddressFieldState.Found,
    phone:
      phone !== null
        ? AddressFieldState.Found
        : details.phone === null
          ? AddressFieldState.Missing
          : AddressFieldState.Check,
    zilla: place.zillaId === null ? AddressFieldState.Missing : AddressFieldState.Found,
    thana:
      place.match === CourierAreaMatch.OwnName
        ? AddressFieldState.Found
        : place.match === CourierAreaMatch.Suggested
          ? AddressFieldState.Check
          : AddressFieldState.Missing,
    deliveryAddress: details.address === null ? AddressFieldState.Missing : AddressFieldState.Found,
    notes: details.note === null ? AddressFieldState.Missing : AddressFieldState.Found,
  };
  const scored = [
    fields.customerName,
    fields.phone,
    fields.zilla,
    fields.thana,
    fields.deliveryAddress,
  ];
  const confidence = scored.reduce((sum, state) => sum + WEIGHT[state], 0) / scored.length;
  return {
    draft: {
      customerName: within(details.name, CUSTOMER_NAME_MAX_LENGTH),
      phone,
      zillaId: place.zillaId,
      locationId: place.thanaId ?? place.suggestedThanaId,
      deliveryAddress: within(details.address, ORDER_ADDRESS_MAX_LENGTH),
      notes: within(details.note, ORDER_NOTES_MAX_LENGTH),
    },
    fields,
    written: {
      phone: phone === null ? details.phone : null,
      zilla: place.zillaId === null ? details.zilla : null,
      thana: fields.thana === AddressFieldState.Found ? null : details.thana,
    },
    confidence: Math.round(confidence * 1000) / 1000,
  };
}

/**
 * ORD-34 (amended 2026-11-06, Slice 7.6's read): a read is charged only when it found something to use -- a name with a
 * phone, or a place on Lytro's list. One that found nothing costs the shop nothing.
 */
export function foundSomething(read: ShapedRead): boolean {
  const named =
    read.fields.customerName === AddressFieldState.Found &&
    read.fields.phone !== AddressFieldState.Missing;
  return named || read.fields.zilla === AddressFieldState.Found;
}

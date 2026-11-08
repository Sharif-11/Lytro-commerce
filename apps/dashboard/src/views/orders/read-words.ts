import { AddressFieldState, type AddressRead } from '@lytronix/validators';

/** How many of the six a read can fill (the name, phone, zilla, thana, address and a delivery note) it filled. */
export function filledOf(read: AddressRead): number {
  return Object.values(read.fields).filter((state) => state !== AddressFieldState.Missing).length;
}

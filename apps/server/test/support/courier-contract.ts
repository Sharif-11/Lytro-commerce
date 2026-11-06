import { describe, expect, it } from 'vitest';
import { ParcelReading } from '@lytronix/validators';
import type {
  CourierAccount,
  CourierAdapter,
  MessageHeaders,
  ParcelBooking,
} from '../../src/modules/couriers/ports/courier-adapter';
import { CourierNoAnswer } from '../../src/modules/couriers/ports/courier-adapter';

/** What a courier's fake must let the suite do, however its own API works. */
export interface CourierContractSetup {
  adapter: CourierAdapter;
  /** A working account, and one the courier refuses. */
  account: CourierAccount;
  badAccount: CourierAccount;
  booking: ParcelBooking;
  /** Credential values that must never appear in anything an adapter says. */
  secrets: string[];
  reset(): void;
  /** How many parcels the courier now holds. */
  parcels(): number;
  /** The next booking is refused for a reason of the courier's own, in these words. */
  nextBookingRefused(words: string): void;
  /** The next booking gets no answer, though the parcel is made. */
  nextBookingLost(): void;
  /** The courier answers a web page instead. */
  nextBookingPage(): void;
  /** A status message for this parcel, as this courier sends one, and what it should read as (Slice 6.2). */
  message: (status: string) => { rawBody: Buffer; headers: MessageHeaders; good: MessageHeaders };
  /** The token the owner pasted for this courier's messages. */
  messageToken: string;
  /** A status this courier never sends. */
  strangeStatus: string;
  /** Sets where the booked parcel stands at the courier. */
  parcelStandsAt(status: string): void;
  /** One status it stands behind as delivered, and one that is only its rider's word, for a courier that has such a status. */
  deliveredStatus: string;
  unconfirmedStatus: string | null;
  /**
   * What proves a message is the courier's: a signature over its body (Steadfast), the secret itself, which can't cover the body
   * (Pathao), or only the address it was sent to (RedX, read agreed 2026-11-06).
   */
  proof: 'body' | 'secret' | 'address';
}

/**
 * CRR-21 (Phase 6 Slice 6.1): the suite every courier adapter passes before it is enabled for any shop: what it declares, booking, a
 * refusal, a lost answer and, where it can, asking by our own number or cancelling. Slice 6.2 adds its message parsing, verification
 * and dedupe; Slices 6.3 and 6.4 run this same suite on Pathao and RedX, which is what exit criterion 8 rests on.
 */
export function courierContract(name: string, setup: () => CourierContractSetup): void {
  describe(`the courier contract: ${name} (CRR-21)`, () => {
    it('declares what shared code needs, and nothing of a shop', () => {
      const { adapter } = setup();
      expect(adapter.name.length).toBeGreaterThan(0);
      expect(adapter.credentialFields.length).toBeGreaterThan(0);
      expect(adapter.limits.addressMax).toBeGreaterThan(0);
      expect(adapter.limits.nameMax).toBeGreaterThan(0);
      expect(adapter.limits.noteMax).toBeGreaterThan(0);
      expect(adapter.limits.phoneDigits).toBe(11);
      expect(typeof adapter.needsArea).toBe('boolean');
    });

    it('accepts working credentials without making a parcel, and refuses others', async () => {
      const contract = setup();
      contract.reset();
      await expect(contract.adapter.testConnection(contract.account)).resolves.toEqual({
        outcome: 'accepted',
      });
      const refused = await contract.adapter.testConnection(contract.badAccount);
      expect(refused).toMatchObject({ outcome: 'refused', refusal: { login: true } });
      expect(contract.parcels()).toBe(0);
    });

    it('books one parcel and names its consignment', async () => {
      const contract = setup();
      contract.reset();
      const answer = await contract.adapter.book(contract.account, contract.booking);
      expect(answer.outcome).toBe('accepted');
      if (answer.outcome !== 'accepted') return;
      expect(answer.parcel.consignmentId.length).toBeGreaterThan(0);
      expect(contract.parcels()).toBe(1);
    });

    it('returns a refusal in the courier’s own short words, as plain text', async () => {
      const contract = setup();
      contract.reset();
      contract.nextBookingRefused(`<b>Refused</b> ${'x'.repeat(400)}`);
      const answer = await contract.adapter.book(contract.account, contract.booking);
      expect(answer.outcome).toBe('refused');
      if (answer.outcome !== 'refused') return;
      expect(answer.refusal.login).toBe(false);
      expect(answer.refusal.message?.length).toBeLessThanOrEqual(200);
      expect(answer.refusal.message).not.toContain('<b>');
      expect(contract.parcels()).toBe(0);
    });

    it('throws no answer when one is lost, never calling it refused', async () => {
      const contract = setup();
      contract.reset();
      contract.nextBookingLost();
      await expect(
        contract.adapter.book(contract.account, contract.booking),
      ).rejects.toBeInstanceOf(CourierNoAnswer);
      contract.reset();
      contract.nextBookingPage();
      await expect(
        contract.adapter.book(contract.account, contract.booking),
      ).rejects.toBeInstanceOf(CourierNoAnswer);
    });

    it('says no credential in anything it answers or throws', async () => {
      const contract = setup();
      contract.reset();
      const said: string[] = [];
      said.push(JSON.stringify(await contract.adapter.testConnection(contract.badAccount)));
      contract.nextBookingLost();
      await contract.adapter.book(contract.account, contract.booking).catch((error: unknown) => {
        said.push(String(error), JSON.stringify(error));
      });
      for (const secret of contract.secrets) {
        expect(said.join(' ')).not.toContain(secret);
      }
    });

    it('accepts a message only with this courier’s own proof (CRR-11)', () => {
      const { adapter, messageToken, message, deliveredStatus, proof } = setup();
      const { rawBody, headers, good } = message(deliveredStatus);
      expect(adapter.verifyMessage(messageToken, rawBody, good)).toBe(true);
      if (proof === 'address') {
        // No proof of its own: the address's token, checked before any adapter code runs, is all there is.
        expect(adapter.verifyMessage(messageToken, rawBody, headers)).toBe(true);
        return;
      }
      expect(adapter.verifyMessage(messageToken, rawBody, headers)).toBe(false);
      expect(adapter.verifyMessage('another-token', rawBody, good)).toBe(false);
      expect(adapter.verifyMessage(messageToken, Buffer.from('{"forged":true}'), good)).toBe(
        proof !== 'body',
      );
    });

    it('gives one message one key, however many times it is sent (CRR-13)', () => {
      const { adapter, message, deliveredStatus } = setup();
      const { rawBody, good } = message(deliveredStatus);
      const first = adapter.readMessage(rawBody, good);
      const again = adapter.readMessage(rawBody, good);
      expect(first?.dedupeKey).toBeTruthy();
      expect(again?.dedupeKey).toBe(first?.dedupeKey);
    });

    it('maps what it stands behind, and not its rider’s word or a status it doesn’t know (CRR-29)', () => {
      const { adapter, message, deliveredStatus, unconfirmedStatus, strangeStatus } = setup();
      const read = (status: string) => {
        const { rawBody, good } = message(status);
        return adapter.readMessage(rawBody, good);
      };
      expect(read(deliveredStatus)).toMatchObject({
        statusEvent: true,
        reading: ParcelReading.Delivered,
      });
      if (unconfirmedStatus !== null) {
        expect(read(unconfirmedStatus)?.reading).toBe(ParcelReading.Unconfirmed);
      }
      expect(read(strangeStatus)).toMatchObject({ statusEvent: true, reading: null });
    });

    it('reads nothing from what isn’t a message', () => {
      const { adapter } = setup();
      expect(adapter.readMessage(Buffer.from('<html>'), {})).toBeNull();
      expect(adapter.readMessage(Buffer.from('[1,2]'), {})).toBeNull();
    });

    it('says where a booked parcel stands, and a repeat of that has one key (CRR-14)', async () => {
      const contract = setup();
      contract.reset();
      const { adapter, account, booking } = contract;
      const answer = await adapter.book(account, booking);
      if (answer.outcome !== 'accepted') throw new Error('it should have booked');
      contract.parcelStandsAt(contract.deliveredStatus);
      const parcel = { consignmentId: answer.parcel.consignmentId, invoice: booking.invoice };
      const first = await adapter.track(account, parcel);
      const again = await adapter.track(account, parcel);
      expect(first).toMatchObject({ outcome: 'found', news: { reading: ParcelReading.Delivered } });
      expect(first).toEqual(again);
    });

    it('asks by our own number, if it says it can', async () => {
      const contract = setup();
      contract.reset();
      const { adapter, account, booking } = contract;
      const lookUp = adapter.lookUp?.bind(adapter);
      if (!lookUp) return;
      await expect(lookUp(account, booking.invoice)).resolves.toEqual({ outcome: 'not_found' });
      await adapter.book(account, booking);
      await expect(lookUp(account, booking.invoice)).resolves.toMatchObject({ outcome: 'found' });
    });
  });
}

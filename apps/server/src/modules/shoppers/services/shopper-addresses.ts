import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  SHOPPER_ADDRESSES_MAX,
  ServerFieldProblemCode,
  type ShopperAddressInput,
  type ShopperAddressUpdateInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { LocationService } from '../../delivery/services/location.service';
import type { ShopperStore } from '../ports/shopper-store';
import { SHOPPER_STORE } from '../tokens';
import type { ShopperAddressRecord, ShopperAddressView, SignedInShopper } from '../types/shoppers';

/**
 * CUS-06, CUS-08 (Phase 4 Slice 4.4b): a shopper's saved addresses -- a label, a thana from the canonical list and the
 * address itself -- up to SHOPPER_ADDRESSES_MAX, exactly one of them the default once there is any: the first saved,
 * or whichever is made the default; when the default goes, the oldest left takes its place. One change at a time per
 * shopper, so the limit and the default always hold.
 */
@Injectable()
export class ShopperAddresses {
  constructor(
    @Inject(SHOPPER_STORE) private readonly store: ShopperStore,
    @Inject(LocationService) private readonly locations: LocationService,
  ) {}

  list(tenantId: string, signedIn: SignedInShopper): Promise<ShopperAddressView[]> {
    return this.store.run(tenantId, async (tx) =>
      this.viewsOf(await this.store.listAddresses(tx, tenantId, signedIn.shopper.id)),
    );
  }

  async add(
    tenantId: string,
    signedIn: SignedInShopper,
    input: ShopperAddressInput,
  ): Promise<ShopperAddressView[]> {
    await this.refuseUnknownThana(input.locationId);
    return this.change(tenantId, signedIn, async (tx, current) => {
      if (current.length >= SHOPPER_ADDRESSES_MAX) {
        throw new ApiError(
          'conflict',
          'TooManyAddresses',
          { max: SHOPPER_ADDRESSES_MAX },
          undefined,
          {
            max: SHOPPER_ADDRESSES_MAX,
          },
        );
      }
      const isDefault = current.length === 0 || input.isDefault === true;
      if (isDefault) await this.store.clearDefault(tx, tenantId, signedIn.shopper.id);
      await this.store.insertAddress(tx, tenantId, signedIn.shopper.id, {
        label: input.label,
        locationId: input.locationId,
        deliveryAddress: input.deliveryAddress,
        isDefault,
      });
    });
  }

  async update(
    tenantId: string,
    signedIn: SignedInShopper,
    addressId: string,
    input: ShopperAddressUpdateInput,
  ): Promise<ShopperAddressView[]> {
    if (input.locationId !== undefined) await this.refuseUnknownThana(input.locationId);
    return this.change(tenantId, signedIn, async (tx, current) => {
      const address = this.find(current, addressId);
      if (input.isDefault === true && !address.isDefault) {
        await this.store.clearDefault(tx, tenantId, signedIn.shopper.id);
      }
      await this.store.updateAddress(tx, tenantId, address.id, {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
        ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress } : {}),
        // The default stays one until another is made the default; `false` alone never leaves none.
        ...(input.isDefault === true ? { isDefault: true } : {}),
      });
    });
  }

  remove(
    tenantId: string,
    signedIn: SignedInShopper,
    addressId: string,
  ): Promise<ShopperAddressView[]> {
    return this.change(tenantId, signedIn, async (tx, current) => {
      const address = this.find(current, addressId);
      await this.store.deleteAddress(tx, tenantId, address.id);
      const oldest = current
        .filter((row) => row.id !== address.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (address.isDefault && oldest) {
        await this.store.updateAddress(tx, tenantId, oldest.id, { isDefault: true });
      }
    });
  }

  /** One change, the shopper held throughout; the addresses as they then stand. */
  private change(
    tenantId: string,
    signedIn: SignedInShopper,
    work: (tx: Transaction, current: ShopperAddressRecord[]) => Promise<void>,
  ): Promise<ShopperAddressView[]> {
    return this.store.run(tenantId, async (tx) => {
      if (!(await this.store.lock(tx, tenantId, signedIn.shopper.id))) {
        throw new ApiError('unauthenticated', 'SignInToContinue', {});
      }
      await work(tx, await this.store.listAddresses(tx, tenantId, signedIn.shopper.id));
      return this.viewsOf(await this.store.listAddresses(tx, tenantId, signedIn.shopper.id));
    });
  }

  private find(current: ShopperAddressRecord[], id: string): ShopperAddressRecord {
    const address = current.find((row) => row.id === id);
    if (!address) throw new ApiError('not_found', 'ShopperAddressNotFound', {});
    return address;
  }

  private async refuseUnknownThana(locationId: number): Promise<void> {
    if (await this.locations.thana(locationId)) return;
    throw new FieldsError([
      {
        field: 'locationId',
        problem: ServerFieldProblemCode.NotFound,
        messageKey: 'LocationNotFound',
      },
    ]);
  }

  private async viewsOf(rows: ShopperAddressRecord[]): Promise<ShopperAddressView[]> {
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        label: row.label,
        location: await this.locations.thana(row.locationId),
        deliveryAddress: row.deliveryAddress,
        isDefault: row.isDefault,
      })),
    );
  }
}

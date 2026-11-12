import { Inject, Injectable } from '@nestjs/common';
import type { ProductPhotoPlacement, Transaction } from '@lytronix/db';
import { ServerFieldProblemCode, type ProductImagesInput } from '@lytronix/validators';
import { FieldsError, type InvalidField } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { DesignNotOfProduct } from '../../../common/errors/design-refused';
import type { CatalogueImageStore, DesignStore } from '../ports/catalogue-stores';
import type { DesignView } from '../types/catalogue';
import { CATALOGUE_IMAGE_STORE, DESIGN_STORE } from '../tokens';

/** ATR-19: a photo or a variant named a design that is not one of its product's live ones. */
export function refuseDesign(error: unknown, field: string): void {
  if (error instanceof DesignNotOfProduct) {
    throw new FieldsError([
      { field, problem: ServerFieldProblemCode.NotFound, messageKey: 'DesignNotOfProduct' },
    ]);
  }
}

/** What a photos save did to the product's designs, for the variants that follow them. */
export interface DesignsSaved {
  photos: ProductPhotoPlacement[];
  /** Designs no photo shows any more: retired now, so their variants go too (PD-16). */
  retired: string[];
}

/**
 * ATR-19 (PHOTO-DESIGNS-PLAN PD-1, PD-2, PD-13, PD-14, PD-16): a product's own photos as its designs. A photos save names
 * each photo's design by a key; a design with an id keeps it and its number, and a new one takes the next number the
 * product has never used. A design left with no photo is retired, never deleted, so past orders keep its name.
 */
@Injectable()
export class ProductDesigns {
  constructor(
    @Inject(DESIGN_STORE) private readonly designs: DesignStore,
    @Inject(CATALOGUE_IMAGE_STORE) private readonly photos: CatalogueImageStore,
  ) {}

  /** The platform's one photo-designs attribute. */
  attributeId(tx: Transaction, tenantId: string): Promise<string> {
    return this.designs.designAttributeId(tx, tenantId);
  }

  /** PD-16: applies the save's designs, and returns where each photo goes and which designs retired. */
  async save(
    tx: Transaction,
    tenantId: string,
    productId: string,
    input: ProductImagesInput,
  ): Promise<DesignsSaved> {
    const all = await this.designs.listDesigns(tx, tenantId, [productId], true);
    const live = all.filter((design) => design.retiredAt === null);
    if (input.photos === undefined) {
      // As before (PRD-11): every photo plain, so every design goes.
      const photos = (input.mediaIds ?? []).map((mediaId) => ({ mediaId, designOptionId: null }));
      return { photos, retired: live.map((design) => design.id) };
    }

    // Every design is checked before anything is written: a name the database refuses would end the transaction, so
    // the names are followed here in the order they are written, the product's live designs first.
    const problems: InvalidField[] = [];
    const taken = (index: number): InvalidField => ({
      field: `designs.${String(index)}.name`,
      problem: ServerFieldProblemCode.Taken,
      messageKey: 'DesignNameTaken',
    });
    const liveIds = new Map(live.map((design) => [design.id, design]));
    const holderOf = new Map(live.map((design) => [design.name.toLowerCase(), design.id]));
    let next = all.reduce((most, design) => Math.max(most, design.number), 0) + 1;
    const writes: {
      index: number;
      key: string;
      id: string | null;
      name: string | null;
      number: number;
    }[] = [];
    for (const [index, design] of (input.designs ?? []).entries()) {
      if (design.id !== undefined) {
        const current = liveIds.get(design.id);
        if (!current) {
          problems.push({
            field: `designs.${String(index)}.id`,
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'DesignNotOfProduct',
          });
          continue;
        }
        const name = design.name !== undefined && design.name !== current.name ? design.name : null;
        if (name !== null) {
          const holder = holderOf.get(name.toLowerCase());
          if (holder !== undefined && holder !== design.id) {
            problems.push(taken(index));
            continue;
          }
          holderOf.delete(current.name.toLowerCase());
          holderOf.set(name.toLowerCase(), design.id);
        }
        writes.push({ index, key: design.key, id: design.id, name, number: current.number });
      } else {
        const number = next;
        next += 1;
        const name = design.name ?? `D${String(number)}`;
        if (holderOf.has(name.toLowerCase())) {
          problems.push(taken(index));
          continue;
        }
        holderOf.set(name.toLowerCase(), design.key);
        writes.push({ index, key: design.key, id: null, name, number });
      }
    }
    if (problems.length > 0) throw new FieldsError(problems);

    const byKey = new Map<string, string>();
    let attributeId: string | null = null;
    for (const write of writes) {
      try {
        if (write.id !== null) {
          if (write.name !== null)
            await this.designs.renameDesign(tx, tenantId, write.id, write.name);
          byKey.set(write.key, write.id);
        } else {
          attributeId ??= await this.designs.designAttributeId(tx, tenantId);
          const id = await this.designs.insertDesign(tx, {
            tenantId,
            productId,
            attributeId,
            name: write.name ?? `D${String(write.number)}`,
            number: write.number,
          });
          byKey.set(write.key, id);
        }
      } catch (error) {
        // A name the check above missed (the database's lower() differs from ours): the transaction is over.
        if (error instanceof UniqueViolation) throw new FieldsError([taken(write.index)]);
        throw error;
      }
    }

    const photos = input.photos.map((photo) => ({
      mediaId: photo.mediaId,
      designOptionId: photo.design === null ? null : (byKey.get(photo.design) ?? null),
    }));
    const kept = new Set(byKey.values());
    const retired = live.filter((design) => !kept.has(design.id)).map((design) => design.id);
    return { photos, retired };
  }

  /**
   * PD-16: after the photos are written, the designs no photo shows are retired (the database refuses a photo showing a
   * retired design, so this comes second).
   */
  retire(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    return this.designs.retireDesigns(tx, tenantId, ids);
  }

  /**
   * PRD-18 (PD-13): a copy's own designs, the same names and numbers as the original's live ones, so its variants and
   * photos never point at another product's. Returns each original design's copy, by id.
   */
  async copy(
    tx: Transaction,
    tenantId: string,
    fromProductId: string,
    toProductId: string,
  ): Promise<Map<string, string>> {
    const designs = await this.designs.listDesigns(tx, tenantId, [fromProductId], false);
    const copies = new Map<string, string>();
    if (designs.length === 0) return copies;
    const attributeId = await this.designs.designAttributeId(tx, tenantId);
    for (const design of designs) {
      const id = await this.designs.insertDesign(tx, {
        tenantId,
        productId: toProductId,
        attributeId,
        name: design.name,
        number: design.number,
      });
      copies.set(design.id, id);
    }
    return copies;
  }

  /** ATR-19: each product's live designs, in number order, each with its photos in the order shown. */
  async of(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<Map<string, DesignView[]>> {
    const designs = await this.designs.listDesigns(tx, tenantId, productIds, false);
    const result = new Map<string, DesignView[]>();
    if (designs.length === 0) return result;
    const rows = await this.photos.listProductImages(tx, tenantId, productIds);
    const photosOf = new Map<string, string[]>();
    for (const row of rows) {
      if (row.designOptionId === null) continue;
      photosOf.set(row.designOptionId, [...(photosOf.get(row.designOptionId) ?? []), row.mediaId]);
    }
    for (const design of designs) {
      const view: DesignView = {
        id: design.id,
        name: design.name,
        number: design.number,
        photoIds: photosOf.get(design.id) ?? [],
      };
      result.set(design.productId, [...(result.get(design.productId) ?? []), view]);
    }
    return result;
  }
}

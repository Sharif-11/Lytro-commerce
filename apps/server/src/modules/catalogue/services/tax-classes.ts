import { Inject, Injectable } from '@nestjs/common';
import type { SelectTaxClass, Transaction } from '@lytronix/db';
import {
  AuditAction,
  ServerFieldProblemCode,
  TAX_CLASSES_MAX,
  type TaxClassInput,
  type TaxClassUpdateInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { TaxClassStore } from '../ports/tax-class-store';
import { TAX_CLASS_STORE } from '../tokens';
import type { CatalogueActor } from '../types/catalogue';
import { CatalogueActivity } from './catalogue-activity';

/** TAX-01: one class as the shop sees it. */
export interface TaxClassView {
  id: string;
  name: string;
  rate: string;
}

/** TAX-01: the shop's classes, and the one each new product starts with. */
export interface TaxClassesView {
  classes: TaxClassView[];
  defaultId: string | null;
}

function viewOf(row: SelectTaxClass): TaxClassView {
  return { id: row.id, name: row.name, rate: row.rate };
}

/**
 * TAX-01, TAX-02 (Phase 4 Slice 4.6a, read agreed 2026-10-30): a shop's named tax classes, each with its rate, up to
 * TAX_CLASSES_MAX, one name each ignoring case; and the class each new product starts with. Prices include the tax, so
 * a class only says how much of a price is tax. A class a product names is never deleted; a new rate applies to orders
 * from then on, past ones keeping theirs. Each change is in the activity log.
 */
@Injectable()
export class TaxClasses {
  constructor(
    @Inject(TAX_CLASS_STORE) private readonly store: TaxClassStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  list(tenantId: string): Promise<TaxClassesView> {
    return this.store.run(tenantId, async (tx) => ({
      classes: (await this.store.list(tx, tenantId)).map(viewOf),
      defaultId: await this.store.defaultOf(tx, tenantId),
    }));
  }

  async create(
    tenantId: string,
    input: TaxClassInput,
    actor: CatalogueActor,
  ): Promise<TaxClassesView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      if ((await this.store.lockAll(tx, tenantId)) >= TAX_CLASSES_MAX) {
        throw new ApiError('conflict', 'TooManyTaxClasses', { max: TAX_CLASSES_MAX }, undefined, {
          max: TAX_CLASSES_MAX,
        });
      }
      const made = await this.named(() =>
        this.store.insert(tx, tenantId, { name: input.name, rate: input.rate.toFixed(2) }),
      );
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.TaxClassSaved,
        {
          type: 'tax_class',
          id: made.id,
        },
        { name: made.name, rate: made.rate },
      );
      return this.viewWithin(tx, tenantId);
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: TaxClassUpdateInput,
    actor: CatalogueActor,
  ): Promise<TaxClassesView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const changed = await this.named(() =>
        this.store.update(tx, tenantId, id, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.rate !== undefined ? { rate: input.rate.toFixed(2) } : {}),
        }),
      );
      if (!changed) throw new ApiError('not_found', 'TaxClassNotFound', {});
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.TaxClassSaved,
        {
          type: 'tax_class',
          id: changed.id,
        },
        { name: changed.name, rate: changed.rate },
      );
      return this.viewWithin(tx, tenantId);
    });
  }

  /** A class no product names; the shop's default is cleared with it. */
  async remove(tenantId: string, id: string, actor: CatalogueActor): Promise<TaxClassesView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const found = await this.store.find(tx, tenantId, id);
      if (!found) throw new ApiError('not_found', 'TaxClassNotFound', {});
      const using = await this.store.countProducts(tx, tenantId, id);
      if (using > 0) {
        throw new ApiError('conflict', 'TaxClassInUse', { products: using }, undefined, {
          count: using,
        });
      }
      if ((await this.store.defaultOf(tx, tenantId)) === id) {
        await this.store.setDefault(tx, tenantId, null);
      }
      await this.store.delete(tx, tenantId, id);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.TaxClassDeleted,
        {
          type: 'tax_class',
          id,
        },
        { name: found.name },
      );
      return this.viewWithin(tx, tenantId);
    });
  }

  /** Agreed 2026-10-30: the class each new product starts with, or none. Products already made keep theirs. */
  async setDefault(
    tenantId: string,
    id: string | null,
    actor: CatalogueActor,
  ): Promise<TaxClassesView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      if (id !== null) await this.refuseUnknown(tx, tenantId, id, 'taxClassId');
      await this.store.setDefault(tx, tenantId, id);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.TaxClassSaved,
        {
          type: 'tax_class',
          id,
        },
        { default: true },
      );
      return this.viewWithin(tx, tenantId);
    });
  }

  /**
   * TAX-01: the class a product is saved with, in the caller's transaction -- for a new product given none, the shop's
   * default; null for untaxed; a class not of the shop is refused, naming `field`.
   */
  async resolveWithin(
    tx: Transaction,
    tenantId: string,
    given: string | null | undefined,
    forNewProduct: boolean,
  ): Promise<string | null | undefined> {
    if (given === undefined) return forNewProduct ? this.store.defaultOf(tx, tenantId) : undefined;
    if (given !== null) await this.refuseUnknown(tx, tenantId, given, 'taxClassId');
    return given;
  }

  /** TAX-02: the class as a product shows it and an order line copies it, or null for untaxed. */
  async ofWithin(
    tx: Transaction,
    tenantId: string,
    id: string | null,
  ): Promise<TaxClassView | null> {
    if (id === null) return null;
    const found = await this.store.find(tx, tenantId, id);
    return found ? viewOf(found) : null;
  }

  private async viewWithin(tx: Transaction, tenantId: string): Promise<TaxClassesView> {
    return {
      classes: (await this.store.list(tx, tenantId)).map(viewOf),
      defaultId: await this.store.defaultOf(tx, tenantId),
    };
  }

  private async refuseUnknown(
    tx: Transaction,
    tenantId: string,
    id: string,
    field: string,
  ): Promise<void> {
    if (await this.store.find(tx, tenantId, id)) return;
    throw new FieldsError([
      { field, problem: ServerFieldProblemCode.NotFound, messageKey: 'TaxClassNotFound' },
    ]);
  }

  private async named<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof UniqueViolation && error.target === 'name') {
        throw new FieldsError(
          [
            {
              field: 'name',
              problem: ServerFieldProblemCode.Taken,
              messageKey: 'TaxClassNameTaken',
            },
          ],
          'conflict',
        );
      }
      throw error;
    }
  }
}

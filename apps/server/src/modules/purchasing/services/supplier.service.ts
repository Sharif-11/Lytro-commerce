import { Inject, Injectable } from '@nestjs/common';
import type { SupplierPatch, Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  ServerFieldProblemCode,
  type CreateSupplierInput,
  type SupplierListQuery,
  type UpdateSupplierInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { SupplierStore } from '../ports/supplier-store';
import { SUPPLIER_STORE } from '../tokens';
import type { SupplierPage, SupplierRecord, SupplierView } from '../types/purchasing';

function viewOf(row: SupplierRecord): SupplierView {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    postalAddress: row.address,
    notes: row.notes,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * PUR-01: the shop's suppliers. A name is unique among the live ones, ignoring case, so a name typed again finds the
 * supplier it means. Archiving hides a supplier from new purchases and keeps its name on past ones; it can be brought
 * back. Each change is in the activity log.
 */
@Injectable()
export class SupplierService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(SUPPLIER_STORE) private readonly suppliers: SupplierStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  list(tenantId: string, query: SupplierListQuery): Promise<SupplierPage> {
    return this.transactions.run(async (tx) => {
      const { rows, total } = await this.suppliers.listSuppliers(
        tx,
        tenantId,
        { archived: query.archived ?? false, search: query.q ?? null },
        { offset: (query.page - 1) * query.limit, limit: query.limit },
      );
      return {
        suppliers: rows.map(viewOf),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  get(tenantId: string, id: string): Promise<SupplierView> {
    return this.transactions.run(async (tx) => viewOf(await this.found(tx, tenantId, id)));
  }

  async create(
    tenantId: string,
    input: CreateSupplierInput,
    actor: CatalogueActor,
  ): Promise<SupplierView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const row = await this.named(() =>
        this.suppliers.insertSupplier(tx, tenantId, {
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.postalAddress ?? null,
          notes: input.notes ?? null,
        }),
      );
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.SupplierCreated,
        { type: 'supplier', id: row.id },
        { name: row.name },
      );
      return viewOf(row);
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateSupplierInput,
    actor: CatalogueActor,
  ): Promise<SupplierView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const before = await this.found(tx, tenantId, id);
      const patch: SupplierPatch = {
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.postalAddress,
        notes: input.notes,
      };
      if (input.archived !== undefined && input.archived !== (before.archivedAt !== null)) {
        patch.archivedAt = input.archived ? new Date() : null;
      }
      const row = await this.named(() => this.suppliers.updateSupplier(tx, tenantId, id, patch));
      if (!row) throw new ApiError('not_found', 'SupplierNotFound', {});
      const changed = (Object.keys(patch) as (keyof SupplierPatch)[]).filter(
        (key) => patch[key] !== undefined && (key === 'archivedAt' || patch[key] !== before[key]),
      );
      if (changed.length > 0) {
        await this.activity.record(
          tx,
          tenantId,
          who,
          AuditAction.SupplierUpdated,
          { type: 'supplier', id },
          { name: row.name, changed, archived: row.archivedAt !== null },
        );
      }
      return viewOf(row);
    });
  }

  /**
   * PUR-01: the live supplier a purchase names, inside the purchase's own transaction; one that is archived is no longer
   * offered for new purchases.
   */
  async liveSupplier(
    tx: Transaction,
    tenantId: string,
    id: string,
    field: string,
  ): Promise<SupplierRecord> {
    const row = await this.suppliers.findSupplier(tx, tenantId, id);
    if (!row) {
      throw new FieldsError([
        { field, problem: ServerFieldProblemCode.NotFound, messageKey: 'SupplierNotFound' },
      ]);
    }
    if (row.archivedAt !== null) {
      throw new FieldsError(
        [{ field, problem: FieldProblemCode.NotAllowed, messageKey: 'SupplierArchived' }],
        'conflict',
      );
    }
    return row;
  }

  /**
   * PUR-07: the supplier a name typed with arriving stock means, inside the arrival's own transaction: the live one of
   * that name, ignoring case, or else a new one, in the activity log like any other. Two arrivals typing the same new
   * name at once both get the one supplier the first adds.
   */
  async namedSupplier(
    tx: Transaction,
    tenantId: string,
    name: string,
    who: ResolvedActor,
  ): Promise<SupplierRecord> {
    const found = await this.suppliers.findLiveByName(tx, tenantId, name);
    if (found) return found;
    const row = await this.suppliers.insertSupplierIfFree(tx, tenantId, {
      name,
      phone: null,
      email: null,
      address: null,
      notes: null,
    });
    if (!row) {
      // Another arrival typed the same name a moment ago; the insert waited for it, and its supplier is the one meant.
      const added = await this.suppliers.findLiveByName(tx, tenantId, name);
      if (!added) throw new Error('a supplier name is taken by no live supplier');
      return added;
    }
    await this.activity.record(
      tx,
      tenantId,
      who,
      AuditAction.SupplierCreated,
      { type: 'supplier', id: row.id },
      { name: row.name },
    );
    return row;
  }

  private async found(tx: Transaction, tenantId: string, id: string): Promise<SupplierRecord> {
    const row = await this.suppliers.findSupplier(tx, tenantId, id);
    if (!row) throw new ApiError('not_found', 'SupplierNotFound', {});
    return row;
  }

  /** A write that may meet a live supplier of the same name, answered on the name. */
  private async named<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof UniqueViolation && error.target === 'name') {
        throw new FieldsError(
          [
            {
              field: 'name',
              problem: ServerFieldProblemCode.Taken,
              messageKey: 'SupplierNameTaken',
            },
          ],
          'conflict',
        );
      }
      throw error;
    }
  }
}

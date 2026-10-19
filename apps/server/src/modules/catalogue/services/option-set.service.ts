import { Inject, Injectable } from '@nestjs/common';
import {
  AuditAction,
  ServerFieldProblemCode,
  type CreateOptionSetInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { CatalogueTransactions, OptionSetStore } from '../ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS, OPTION_SET_STORE } from '../tokens';
import type { CatalogueActor, OptionSetRecord, OptionSetView } from '../types/catalogue';
import { CatalogueActivity } from './catalogue-activity';

export function optionSetView(row: OptionSetRecord): OptionSetView {
  return {
    id: row.id,
    name: row.name,
    options: row.options,
    scope: row.tenantId === null ? 'platform' : 'shop',
    presetKey: row.presetKey,
  };
}

/** ATR-16: a set's values once each, ignoring case, in the order first given. */
export function distinctValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function refuseTakenSetName(): never {
  throw new FieldsError(
    [{ field: 'name', problem: ServerFieldProblemCode.Taken, messageKey: 'OptionSetNameTaken' }],
    'conflict',
  );
}

/**
 * ATR-16: the option sets offered while adding values to an attribute. The platform's come first, those for the
 * shop's own type ahead of the rest, then the shop's own. Never mandatory: a set only fills in values, which stay
 * editable after insertion (attributes/:id/options/batch).
 */
@Injectable()
export class OptionSetService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(OPTION_SET_STORE) private readonly sets: OptionSetStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  list(shop: { id: string; businessType: string | null }): Promise<OptionSetView[]> {
    return this.transactions.run(async (tx) => {
      const rows = await this.sets.listOptionSets(tx, shop.id);
      const rank = (row: OptionSetRecord): number =>
        row.tenantId !== null
          ? 2
          : row.presetKey !== null && row.presetKey === shop.businessType
            ? 0
            : 1;
      // A stable sort keeps the store's order within each group.
      return [...rows].sort((a, b) => rank(a) - rank(b)).map(optionSetView);
    });
  }

  /** A shop's own set. A name the shop already sees, its own or the platform's, is taken. */
  async create(
    tenantId: string,
    input: CreateOptionSetInput,
    actor: CatalogueActor,
  ): Promise<OptionSetView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const seen = await this.sets.listOptionSets(tx, tenantId);
      if (seen.some((row) => row.name.toLowerCase() === input.name.toLowerCase())) {
        refuseTakenSetName();
      }
      let row: OptionSetRecord;
      try {
        row = await this.sets.insertOptionSet(tx, {
          tenantId,
          name: input.name,
          options: distinctValues(input.options),
        });
      } catch (error) {
        if (error instanceof UniqueViolation) refuseTakenSetName();
        throw error;
      }
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OptionSetCreated,
        { type: 'option_set', id: row.id },
        { name: row.name, options: row.options.length },
      );
      return optionSetView(row);
    });
  }

  /** Deletes one of the shop's own sets. Values already inserted from it stay where they are. */
  async delete(tenantId: string, id: string, actor: CatalogueActor): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.transactions.run(async (tx) => {
      if (!(await this.sets.deleteOptionSet(tx, tenantId, id))) {
        throw new ApiError('not_found', 'OptionSetNotFound', {});
      }
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OptionSetDeleted,
        { type: 'option_set', id },
        {},
      );
    });
  }
}

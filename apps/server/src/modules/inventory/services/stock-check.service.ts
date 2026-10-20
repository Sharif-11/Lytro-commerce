import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  MEASURED_STOCK_UNITS,
  ServerFieldProblemCode,
  StockReason,
  StockTracking,
  type RecordStockCheckInput,
  type StockCheckListQuery,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { fromPaisa, quantityTimesCost } from '../../balance/services/money';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import { optionIdsOfKey } from '../../catalogue/services/variant-matrix';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { NewStockCheckLine, StockCheckStore } from '../ports/stock-check-store';
import type { StockStore } from '../ports/stock-store';
import { STOCK_CHECK_STORE, STOCK_STORE } from '../tokens';
import type {
  StockActorView,
  StockChange,
  StockCheckLineRow,
  StockCheckPage,
  StockCheckRow,
  StockCheckTotals,
  StockCheckView,
} from '../types/inventory';
import { InventoryLedger } from './inventory-ledger';
import { milli, quantityOf } from './stock-state';

// What a recount movement names as the record behind it (INV-09).
const STOCK_CHECK_REFERENCE = 'stock_check';

function actorOf(row: StockCheckRow): StockActorView | null {
  return row.actorUserId !== null ? { userId: row.actorUserId, name: row.actorName } : null;
}

/**
 * INV-07, INV-20, INV-21: a stock check. The shop enters what it counted for any set of variants; each difference
 * from the stock held is recorded as one recount movement through the ledger, and the check reports the value gained
 * or lost at each variant's average cost at that moment. Cost and value are shown only to a caller who may see cost
 * (D3-9).
 */
@Injectable()
export class StockCheckService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly stock: StockStore,
    @Inject(STOCK_CHECK_STORE) private readonly checks: StockCheckStore,
    @Inject(InventoryLedger) private readonly ledger: InventoryLedger,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  async record(
    tenantId: string,
    input: RecordStockCheckInput,
    actor: CatalogueActor,
  ): Promise<StockCheckView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const variants = new Map(
        (
          await this.stock.findVariants(
            tx,
            tenantId,
            input.lines.map((line) => line.variantId),
          )
        ).map((row) => [row.variantId, row]),
      );
      const problems = input.lines.flatMap((line, index): InvalidField[] => {
        const field = `lines.${String(index)}`;
        const variant = variants.get(line.variantId);
        if (!variant || variant.product.deletedAt !== null) {
          return [
            {
              field: `${field}.variantId`,
              problem: ServerFieldProblemCode.NotFound,
              messageKey: 'ProductNotFound',
            },
          ];
        }
        if (variant.product.stockTracking !== StockTracking.Tracked) {
          return [
            {
              field: `${field}.variantId`,
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'MadeToOrderHasNoStock',
            },
          ];
        }
        if (
          !MEASURED_STOCK_UNITS.includes(variant.product.stockUnit) &&
          !Number.isInteger(line.counted)
        ) {
          return [
            {
              field: `${field}.counted`,
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'WholeUnitsOnly',
            },
          ];
        }
        return [];
      });
      if (problems.length > 0) throw new FieldsError(problems);

      // Each variant's stock is locked before it is compared, in one order, so a sale landing mid-check waits for
      // it and the recorded difference is from the number actually held.
      const lines = [...input.lines].sort((a, b) =>
        a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0,
      );
      const held = new Map<string, string>();
      for (const line of lines) {
        held.set(line.variantId, await this.stock.lockLevel(tx, tenantId, line.variantId));
      }

      const check = await this.checks.insertCheck(tx, tenantId, {
        actorUserId: who.id,
        note: input.note ?? null,
      });
      const changes: StockChange[] = lines.flatMap((line) => {
        const difference = milli(line.counted) - milli(held.get(line.variantId) ?? '0');
        return difference === 0
          ? []
          : [
              {
                variantId: line.variantId,
                delta: quantityOf(difference),
                reason: StockReason.Recount,
                reference: { type: STOCK_CHECK_REFERENCE, id: check.id },
              },
            ];
      });
      const movements = new Map(
        (await this.ledger.apply(tx, tenantId, changes, who)).map((row) => [row.variantId, row.id]),
      );
      const stored: NewStockCheckLine[] = lines.map((line) => {
        const variant = variants.get(line.variantId);
        if (!variant) throw new Error('a checked variant was found above');
        return {
          productId: variant.productId,
          variantId: line.variantId,
          expected: quantityOf(milli(held.get(line.variantId) ?? '0')),
          counted: quantityOf(milli(line.counted)),
          unitCost: variant.avgCost,
          movementId: movements.get(line.variantId) ?? null,
        };
      });
      await this.checks.insertLines(tx, tenantId, check.id, stored);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.StockChecked,
        { type: STOCK_CHECK_REFERENCE, id: check.id },
        { lines: stored.length, changed: changes.length },
      );
      return this.viewWithin(tx, tenantId, check.id, true);
    });
  }

  /** INV-07: the shop's checks, newest first, each with its totals. */
  list(tenantId: string, query: StockCheckListQuery, canSeeCost: boolean): Promise<StockCheckPage> {
    return this.transactions.run(async (tx) => {
      const { rows, total } = await this.checks.listChecks(tx, tenantId, {
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      return {
        checks: rows.map((row) => ({
          id: row.id,
          note: row.note,
          actor: actorOf(row),
          createdAt: row.createdAt,
          totals: {
            lines: row.lines,
            changed: row.changed,
            ...(canSeeCost
              ? {
                  valueGained: row.valueGained,
                  valueLost: row.valueLost,
                  unknownCost: row.unknownCost,
                }
              : {}),
          },
        })),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  get(tenantId: string, checkId: string, canSeeCost: boolean): Promise<StockCheckView> {
    return this.transactions.run((tx) => this.viewWithin(tx, tenantId, checkId, canSeeCost));
  }

  private async viewWithin(
    tx: Transaction,
    tenantId: string,
    checkId: string,
    canSeeCost: boolean,
  ): Promise<StockCheckView> {
    const check = await this.checks.findCheck(tx, tenantId, checkId);
    if (!check) throw new ApiError('not_found', 'StockCheckNotFound', {});
    const rows = await this.checks.listLines(tx, tenantId, checkId);
    return {
      id: check.id,
      note: check.note,
      actor: actorOf(check),
      createdAt: check.createdAt,
      totals: this.totalsOf(rows, canSeeCost),
      lines: rows.map((row) => {
        const difference = quantityOf(milli(row.counted) - milli(row.expected));
        return {
          productId: row.productId,
          variantId: row.variantId,
          productName: row.productName,
          optionIds: row.combinationKey !== null ? optionIdsOfKey(row.combinationKey) : [],
          expected: row.expected,
          counted: row.counted,
          difference,
          ...(canSeeCost
            ? {
                unitCost: row.unitCost,
                value:
                  row.unitCost !== null
                    ? fromPaisa(quantityTimesCost(difference, row.unitCost))
                    : null,
              }
            : {}),
        };
      }),
    };
  }

  /** The same totals the list shows, from the lines: each line rounded to the paisa, then summed. */
  private totalsOf(rows: StockCheckLineRow[], canSeeCost: boolean): StockCheckTotals {
    let gained = 0n;
    let lost = 0n;
    let unknownCost = 0;
    let changed = 0;
    for (const row of rows) {
      const difference = quantityOf(milli(row.counted) - milli(row.expected));
      if (milli(difference) === 0) continue;
      changed += 1;
      if (row.unitCost === null) {
        unknownCost += 1;
        continue;
      }
      const value = quantityTimesCost(difference, row.unitCost);
      if (value > 0n) gained += value;
      else lost -= value;
    }
    return {
      lines: rows.length,
      changed,
      ...(canSeeCost
        ? { valueGained: fromPaisa(gained), valueLost: fromPaisa(lost), unknownCost }
        : {}),
    };
  }
}

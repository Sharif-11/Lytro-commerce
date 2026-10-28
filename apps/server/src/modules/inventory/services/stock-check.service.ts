import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  MEASURED_STOCK_UNITS,
  ServerFieldProblemCode,
  StockReason,
  StockTracking,
  STOCK_HOLDER_KEY,
  type RecordStockCheckInput,
  type StockCheckListQuery,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { fromPaisa, quantityTimesCost } from '../../balance/services/money';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import { ProductService } from '../../catalogue/services/product.service';
import { optionIdsInOrder } from '../../catalogue/services/variant-attributes';
import { optionIdsOfKey } from '../../catalogue/services/variant-matrix';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { StockBatchStore } from '../ports/stock-batch-store';
import type { NewStockCheckLine, StockCheckStore } from '../ports/stock-check-store';
import type { StockStore } from '../ports/stock-store';
import { STOCK_BATCH_STORE, STOCK_CHECK_STORE, STOCK_STORE } from '../tokens';
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
import { SerialEntryService } from './serial-entry.service';
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
    @Inject(STOCK_BATCH_STORE) private readonly batches: StockBatchStore,
    @Inject(InventoryLedger) private readonly ledger: InventoryLedger,
    @Inject(SerialEntryService) private readonly serialEntry: SerialEntryService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(ProductService) private readonly catalogue: ProductService,
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
        // INV-24: a stock holder counts only while its product shares its stock.
        if (
          !variant ||
          variant.product.deletedAt !== null ||
          (variant.isStockHolder && !variant.product.sharedStock)
        ) {
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
        // INV-24: a size drawing on a shared stock holds none of its own; the shared stock is what is counted.
        if (variant.product.sharedStock && !variant.isStockHolder) {
          return [
            {
              field: `${field}.variantId`,
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'StockIsShared',
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
        // INV-12: only a batch-tracked product's stock is counted batch by batch.
        if (line.batchId !== undefined && !variant.product.batchTracked) {
          return [
            {
              field: `${field}.batchId`,
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'BatchesNotTracked',
            },
          ];
        }
        // INV-14: only a serial-numbered product's missing units are named.
        if (line.missingSerials !== undefined && !variant.product.serialTracked) {
          return [
            {
              field: `${field}.missingSerials`,
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'SerialsNotTracked',
            },
          ];
        }
        return [];
      });
      if (problems.length > 0) throw new FieldsError(problems);

      // Each variant's stock is locked before it is compared, in one order (the products, then its level, then its
      // batches), so a sale landing mid-check waits for it and the recorded difference is from the number actually
      // held. A line counting a batch is compared with that batch, any other with the variant's whole stock.
      const lines = [...input.lines].sort((a, b) => {
        const left = `${a.variantId}/${a.batchId ?? ''}`;
        const right = `${b.variantId}/${b.batchId ?? ''}`;
        return left < right ? -1 : left > right ? 1 : 0;
      });
      const held = new Map<string, string>();
      await this.stock.lockProducts(tx, tenantId, [
        ...new Set([...variants.values()].map((row) => row.productId)),
      ]);
      for (const variantId of new Set(lines.map((line) => line.variantId))) {
        held.set(`${variantId}/`, await this.stock.lockLevel(tx, tenantId, variantId));
        if (!lines.some((line) => line.variantId === variantId && line.batchId !== undefined)) {
          continue;
        }
        for (const batch of await this.batches.lockOpenBatches(tx, tenantId, variantId)) {
          held.set(`${variantId}/${batch.id}`, batch.quantity);
        }
      }
      const missing = input.lines.flatMap((line, index): InvalidField[] =>
        line.batchId !== undefined && !held.has(`${line.variantId}/${line.batchId}`)
          ? [
              {
                field: `lines.${String(index)}.batchId`,
                problem: ServerFieldProblemCode.NotFound,
                messageKey: 'BatchNotFound',
              },
            ]
          : [],
      );
      if (missing.length > 0) throw new FieldsError(missing);
      const heldFor = (line: { variantId: string; batchId?: string }): string =>
        held.get(`${line.variantId}/${line.batchId ?? ''}`) ?? '0';

      const check = await this.checks.insertCheck(tx, tenantId, {
        actorUserId: who.id,
        note: input.note ?? null,
      });
      // INV-14: the serials of units found missing, at most one per unit short, each in stock on its variant.
      const missingSerials = new Map<(typeof lines)[number], string[]>();
      for (const line of lines) {
        if (!line.missingSerials) continue;
        const variant = variants.get(line.variantId);
        if (!variant) throw new Error('a checked variant was found above');
        const short = Math.max(milli(heldFor(line)) - milli(line.counted), 0) / 1000;
        missingSerials.set(
          line,
          await this.serialEntry.leaving(
            tx,
            tenantId,
            line.variantId,
            line.missingSerials,
            variant.product.serialFormat,
            `lines.${String(input.lines.indexOf(line))}.missingSerials`,
            short,
          ),
        );
      }
      const changes: StockChange[] = lines.flatMap((line) => {
        const difference = milli(line.counted) - milli(heldFor(line));
        return difference === 0
          ? []
          : [
              {
                variantId: line.variantId,
                delta: quantityOf(difference),
                reason: StockReason.Recount,
                reference: { type: STOCK_CHECK_REFERENCE, id: check.id },
                batchId: line.batchId ?? null,
                serials: missingSerials.get(line) ?? null,
              },
            ];
      });
      // A batch line's movement is its batch's; a whole variant's difference may land in several batches, and the
      // line keeps the first.
      const movements = new Map<string, number>();
      for (const row of await this.ledger.apply(tx, tenantId, changes, who)) {
        movements.set(`${row.variantId}/${row.batchId ?? ''}`, row.id);
        if (!movements.has(`${row.variantId}/`)) movements.set(`${row.variantId}/`, row.id);
      }
      const stored: NewStockCheckLine[] = lines.map((line) => {
        const variant = variants.get(line.variantId);
        if (!variant) throw new Error('a checked variant was found above');
        return {
          productId: variant.productId,
          variantId: line.variantId,
          batchId: line.batchId ?? null,
          expected: quantityOf(milli(heldFor(line))),
          counted: quantityOf(milli(line.counted)),
          unitCost: variant.avgCost,
          movementId: movements.get(`${line.variantId}/${line.batchId ?? ''}`) ?? null,
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
          number: row.number,
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
    // Slice 11.9: each line named as its product's screen names the variant.
    const counted = new Map<string, string[]>();
    for (const row of rows)
      counted.set(row.productId, [...(counted.get(row.productId) ?? []), row.variantId]);
    const splits = await this.catalogue.variantAttributesWithin(tx, tenantId, counted);
    return {
      id: check.id,
      number: check.number,
      note: check.note,
      actor: actorOf(check),
      createdAt: check.createdAt,
      totals: this.totalsOf(rows, canSeeCost),
      products: [...splits].map(([productId, own]) => ({ productId, splits: own })),
      lines: rows.map((row) => {
        const difference = quantityOf(milli(row.counted) - milli(row.expected));
        return {
          productId: row.productId,
          variantId: row.variantId,
          productName: row.productName,
          batch:
            row.batchId !== null
              ? { id: row.batchId, batchCode: row.batchCode, expiresOn: row.expiresOn }
              : null,
          // A shared stock is named by its product alone.
          optionIds:
            row.combinationKey !== null && row.combinationKey !== STOCK_HOLDER_KEY
              ? optionIdsInOrder(
                  splits.get(row.productId) ?? [],
                  optionIdsOfKey(row.combinationKey),
                )
              : [],
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

import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { FieldProblemCode, StockReason, type InventoryFiguresQuery } from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import { DAY_MS, dhakaDate, dhakaDayStart } from '../../../common/time';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { StockStore } from '../ports/stock-store';
import { STOCK_STORE } from '../tokens';
import type {
  CategoryStockValue,
  InventoryFigures,
  MovedFigure,
  OutgoingRow,
  StockValueRow,
} from '../types/inventory';
import { unitTotals } from './unit-quantities';

const NOTHING: MovedFigure = { value: '0.00', movements: 0, unknownCost: 0 };

/** One reason's movements in every unit, as one figure; the value is added in paisa. */
function figureOf(rows: OutgoingRow[]): MovedFigure {
  return {
    value: fromPaisa(rows.reduce((sum, row) => sum + toPaisa(row.value), 0n)),
    movements: rows.reduce((sum, row) => sum + row.movements, 0),
    unknownCost: rows.reduce((sum, row) => sum + row.unknownCost, 0),
  };
}

/** The stock-value rows' worth added in paisa, their uncosted variants counted, and their amounts by unit. */
function valueOf(rows: StockValueRow[]): {
  value: string;
  unknownCost: number;
  units: CategoryStockValue['units'];
} {
  return {
    value: fromPaisa(rows.reduce((sum, row) => sum + toPaisa(row.value), 0n)),
    unknownCost: rows.reduce((sum, row) => sum + row.unknownCost, 0),
    units: unitTotals(rows.map((row) => ({ unit: row.stockUnit, quantity: row.units }))),
  };
}

/** Each category's top-level ancestor (a top-level category is its own). */
function topLevelOf(tree: { id: string; parentId: string | null }[]): (id: string) => string {
  const parentOf = new Map(tree.map((category) => [category.id, category.parentId]));
  return (id) => {
    let current = id;
    // A tree is at most four levels (PRD-03); the bound only guards against a broken parent link.
    for (let step = 0; step < tree.length; step += 1) {
      const parent = parentOf.get(current) ?? null;
      if (parent === null) return current;
      current = parent;
    }
    return current;
  };
}

/** INV-17: sales less what came back, in paisa; the returns' movements and unknown costs are counted too. */
function lessReturns(sales: MovedFigure, returned: MovedFigure): MovedFigure {
  return {
    value: fromPaisa(toPaisa(sales.value) - toPaisa(returned.value)),
    movements: sales.movements + returned.movements,
    unknownCost: sales.unknownCost + returned.unknownCost,
  };
}

/** Adds figures in paisa, so a total is exactly the sum of its parts. */
function total(figures: MovedFigure[]): MovedFigure {
  return {
    value: fromPaisa(figures.reduce((sum, figure) => sum + toPaisa(figure.value), 0n)),
    movements: figures.reduce((sum, figure) => sum + figure.movements, 0),
    unknownCost: figures.reduce((sum, figure) => sum + figure.unknownCost, 0),
  };
}

/**
 * INV-18, D3-9: the inventory figures a shop's statistics (STA-*) read: what the stock held is worth at average cost,
 * the cost of goods sold in a period, and the losses in it by reason, each valued at the cost its movement recorded
 * (INV-11), so a later cost change never moves a past period. The cost of goods sold is the sales less the returns
 * (INV-17), both at the sale's cost; every outgoing movement that was not a sale counts as a loss, a damaged return
 * among them. A movement or variant with no cost adds nothing and is counted, so a figure is never a guess.
 */
@Injectable()
export class InventoryFiguresService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly stock: StockStore,
  ) {}

  /**
   * D3-9: the stock value split by each product's top-level category, the most valuable first and products in no
   * category last.
   */
  private async byCategory(
    tx: Transaction,
    tenantId: string,
    held: StockValueRow[],
  ): Promise<CategoryStockValue[]> {
    const tree = held.some((row) => row.categoryId !== null)
      ? await this.stock.categoryTree(tx, tenantId)
      : [];
    const topLevel = topLevelOf(tree);
    const names = new Map(tree.map((category) => [category.id, category.name]));
    const groups = new Map<string | null, StockValueRow[]>();
    for (const row of held) {
      const key = row.categoryId === null ? null : topLevel(row.categoryId);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()]
      .map(([categoryId, rows]) => ({
        categoryId,
        name: categoryId === null ? null : (names.get(categoryId) ?? null),
        ...valueOf(rows),
      }))
      .sort((a, b) =>
        a.categoryId === null
          ? 1
          : b.categoryId === null
            ? -1
            : Number(toPaisa(b.value) - toPaisa(a.value)),
      );
  }

  figures(
    tenantId: string,
    query: InventoryFiguresQuery,
    now = new Date(),
  ): Promise<InventoryFigures> {
    const dateTo = query.dateTo ?? dhakaDate(now);
    // Left out, the period starts on the first of the month it ends in.
    const dateFrom = query.dateFrom ?? `${dateTo.slice(0, 7)}-01`;
    if (dateFrom > dateTo) {
      throw new FieldsError([
        {
          field: 'dateFrom',
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'PeriodEndsBeforeItStarts',
        },
      ]);
    }
    const period = {
      from: dhakaDayStart(dateFrom),
      to: new Date(dhakaDayStart(dateTo).getTime() + DAY_MS),
    };
    return this.transactions.run(async (tx) => {
      const held = await this.stock.stockValue(tx, tenantId);
      const outgoing = await this.stock.outgoingByReason(tx, tenantId, period);
      const sales = outgoing.filter((row) => row.reason === StockReason.Sale);
      const returned = await this.stock.returnedInPeriod(tx, tenantId, period);
      const reasons = [
        ...new Set(
          outgoing.filter((row) => row.reason !== StockReason.Sale).map((row) => row.reason),
        ),
      ];
      const byReason = reasons.map((reason) => {
        const rows = outgoing.filter((row) => row.reason === reason);
        return {
          reason,
          ...figureOf(rows),
          units: unitTotals(rows.map((row) => ({ unit: row.stockUnit, quantity: row.units }))),
        };
      });
      return {
        dateFrom,
        dateTo,
        stockValue: { ...valueOf(held), byCategory: await this.byCategory(tx, tenantId, held) },
        costOfGoodsSold: lessReturns(sales.length > 0 ? figureOf(sales) : NOTHING, returned),
        losses: { ...total(byReason), byReason },
      };
    });
  }
}

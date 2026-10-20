import { Inject, Injectable } from '@nestjs/common';
import { FieldProblemCode, StockReason, type InventoryFiguresQuery } from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import { DAY_MS, dhakaDate, dhakaDayStart } from '../../../common/time';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { StockStore } from '../ports/stock-store';
import { STOCK_STORE } from '../tokens';
import type { InventoryFigures, MovedFigure, OutgoingRow } from '../types/inventory';

const NOTHING: MovedFigure = { value: '0.00', movements: 0, unknownCost: 0 };

function figureOf(row: OutgoingRow): MovedFigure {
  return { value: row.value, movements: row.movements, unknownCost: row.unknownCost };
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
 * (INV-11), so a later cost change never moves a past period. Every outgoing movement that was not a sale counts as a
 * loss. A movement or variant with no cost adds nothing and is counted, so a figure is never a guess.
 */
@Injectable()
export class InventoryFiguresService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly stock: StockStore,
  ) {}

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
      const stockValue = await this.stock.stockValue(tx, tenantId);
      const outgoing = await this.stock.outgoingByReason(tx, tenantId, period);
      const sales = outgoing.find((row) => row.reason === StockReason.Sale);
      const byReason = outgoing
        .filter((row) => row.reason !== StockReason.Sale)
        .map((row) => ({ reason: row.reason, ...figureOf(row) }));
      return {
        dateFrom,
        dateTo,
        stockValue,
        costOfGoodsSold: sales ? figureOf(sales) : NOTHING,
        losses: { ...total(byReason), byReason },
      };
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  normalizeSerial,
  serialProblem,
  SerialStatus,
  ServerFieldProblemCode,
  StockTracking,
  type AddSerialsInput,
  type CheckSerialsInput,
  type CorrectSerialInput,
  type SerialListQuery,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { SerialStore } from '../ports/serial-store';
import type { StockStore } from '../ports/stock-store';
import { SERIAL_STORE, STOCK_STORE } from '../tokens';
import type { SerialPage, SerialRecord, SerialView, StockVariantRow } from '../types/inventory';
import { SerialEntryService } from './serial-entry.service';
import { milli } from './stock-state';

function viewOf(row: SerialRecord): SerialView {
  return {
    id: row.id,
    variantId: row.variantId,
    serial: row.serial,
    status: row.status,
    receivedMovementId: row.receivedMovementId,
    leftMovementId: row.leftMovementId,
    createdAt: row.createdAt,
  };
}

/**
 * INV-14, INV-21, INV-23: a variant's serial-numbered units as the shop sees and keeps them. Serials for units already
 * held that have none yet are added here (no stock moves); a serial typed wrong is corrected, or removed, while its
 * unit is in stock, and its unit then has no serial again. A serial whose unit has left is history and never changes.
 * Each change is in the activity log.
 */
@Injectable()
export class SerialService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly stock: StockStore,
    @Inject(SERIAL_STORE) private readonly serials: SerialStore,
    @Inject(SerialEntryService) private readonly entry: SerialEntryService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  /** A variant's serials, newest first: the units it holds, or those of one status. */
  list(
    tenantId: string,
    productId: string,
    variantId: string,
    query: SerialListQuery,
  ): Promise<SerialPage> {
    return this.transactions.run(async (tx) => {
      // Readable whatever the product does now: a serial's history outlives its tracking.
      await this.variantOf(tx, tenantId, productId, variantId, false);
      return this.pageWithin(tx, tenantId, variantId, query);
    });
  }

  /**
   * INV-23: which of the serials being entered a unit the shop holds already has, read as the product's serials are,
   * each once and in the order given, so the entry flags them before anything is saved. Saving checks again.
   */
  check(tenantId: string, input: CheckSerialsInput): Promise<{ taken: string[] }> {
    return this.transactions.run(async (tx) => {
      const serials = [...new Set(input.serials.map((raw) => normalizeSerial(raw, input.format)))];
      const held = await this.entry.taken(tx, tenantId, serials);
      return { taken: serials.filter((serial) => held.has(serial)) };
    });
  }

  /** INV-14: serials for units already held, at most one for each unit that has none yet. */
  async add(
    tenantId: string,
    productId: string,
    variantId: string,
    input: AddSerialsInput,
    actor: CatalogueActor,
  ): Promise<SerialPage> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const variant = await this.variantOf(tx, tenantId, productId, variantId, true);
      // The level, then the variant's serials, as every stock writer locks them.
      const onHand = milli(await this.stock.lockLevel(tx, tenantId, variantId)) / 1000;
      const held = await this.serials.lockHeld(tx, tenantId, variantId);
      const serials = await this.entry.arriving(
        tx,
        tenantId,
        input.serials,
        variant.product.serialFormat,
        'serials',
        Math.max(onHand - held.length, 0),
      );
      try {
        await this.serials.insertSerials(
          tx,
          tenantId,
          serials.map((serial) => ({ variantId, serial, receivedMovementId: null })),
        );
      } catch (error) {
        if (error instanceof UniqueViolation) throw new ApiError('conflict', 'SerialTaken', {});
        throw error;
      }
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.SerialsAdded,
        { type: 'product', id: productId },
        { variantId, serials },
      );
      return this.pageWithin(tx, tenantId, variantId, { page: 1, limit: 50 });
    });
  }

  /** INV-14: a serial typed wrong, corrected while its unit is in stock. */
  async correct(
    tenantId: string,
    productId: string,
    serialId: string,
    input: CorrectSerialInput,
    actor: CatalogueActor,
  ): Promise<SerialView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const { row, variant } = await this.inStockSerial(tx, tenantId, productId, serialId);
      const format = variant.product.serialFormat;
      const problem = serialProblem(input.serial, format);
      if (problem !== null) {
        throw new FieldsError([
          {
            field: 'serial',
            problem: FieldProblemCode.InvalidFormat,
            messageKey:
              problem === 'bad_check_digit'
                ? 'ImeiCheckDigitWrong'
                : problem === 'not_imei'
                  ? 'NotAnImei'
                  : 'SerialInvalid',
          },
        ]);
      }
      const serial = normalizeSerial(input.serial, format);
      if (serial !== row.serial) {
        if ((await this.entry.taken(tx, tenantId, [serial])).size > 0) {
          throw new FieldsError(
            [{ field: 'serial', problem: ServerFieldProblemCode.Taken, messageKey: 'SerialTaken' }],
            'conflict',
          );
        }
        try {
          await this.serials.updateSerial(tx, tenantId, serialId, serial);
        } catch (error) {
          if (error instanceof UniqueViolation) throw new ApiError('conflict', 'SerialTaken', {});
          throw error;
        }
        await this.activity.record(
          tx,
          tenantId,
          who,
          AuditAction.SerialCorrected,
          { type: 'product', id: productId },
          { variantId: row.variantId, from: row.serial, to: serial },
        );
      }
      return viewOf({ ...row, serial });
    });
  }

  /** INV-14: a serial removed while its unit is in stock; the unit then has no serial again. */
  async remove(
    tenantId: string,
    productId: string,
    serialId: string,
    actor: CatalogueActor,
  ): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.transactions.run(async (tx) => {
      const { row } = await this.inStockSerial(tx, tenantId, productId, serialId);
      await this.serials.deleteSerial(tx, tenantId, serialId);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.SerialRemoved,
        { type: 'product', id: productId },
        { variantId: row.variantId, serial: row.serial },
      );
    });
  }

  private async pageWithin(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    query: Pick<SerialListQuery, 'page' | 'limit'> & { status?: SerialStatus },
  ): Promise<SerialPage> {
    const { rows, total } = await this.serials.listSerials(
      tx,
      tenantId,
      variantId,
      query.status ?? null,
      { offset: (query.page - 1) * query.limit, limit: query.limit },
    );
    return {
      serials: rows.map(viewOf),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    };
  }

  /** A serial of this live product whose unit is in stock; a unit that has left keeps its serial as history. */
  private async inStockSerial(
    tx: Transaction,
    tenantId: string,
    productId: string,
    serialId: string,
  ): Promise<{ row: SerialRecord; variant: StockVariantRow }> {
    const row = await this.serials.findSerial(tx, tenantId, serialId);
    const [variant] = row ? await this.stock.findVariants(tx, tenantId, [row.variantId]) : [];
    if (!row || variant?.productId !== productId || variant.product.deletedAt !== null) {
      throw new ApiError('not_found', 'SerialNotFound', {});
    }
    if (row.status !== SerialStatus.InStock) {
      throw new ApiError('conflict', 'SerialHasLeft', {});
    }
    return { row, variant };
  }

  /** A variant of this live product; to take serials, one counted and serial-numbered. */
  private async variantOf(
    tx: Transaction,
    tenantId: string,
    productId: string,
    variantId: string,
    takingSerials: boolean,
  ): Promise<StockVariantRow> {
    const [variant] = await this.stock.findVariants(tx, tenantId, [variantId]);
    if (!variant || variant.productId !== productId || variant.product.deletedAt !== null) {
      throw new ApiError('not_found', 'ProductNotFound', {});
    }
    if (
      takingSerials &&
      (variant.product.stockTracking !== StockTracking.Tracked || !variant.product.serialTracked)
    ) {
      throw new ApiError('conflict', 'SerialsNotTracked', {});
    }
    return variant;
  }
}

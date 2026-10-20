import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  FieldProblemCode,
  normalizeSerial,
  SerialStatus,
  ServerFieldProblemCode,
  type SerialFormat,
} from '@lytronix/validators';
import { FieldsError, type InvalidField } from '../../../common/api-error';
import { readSerials } from '../../../common/serial-entry';
import type { SerialStore } from '../ports/serial-store';
import { SERIAL_STORE } from '../tokens';

/**
 * INV-14, INV-23: checks entered serials against what the shop holds, naming the line that is wrong, before anything
 * is saved. Serials arriving are well formed, each listed once, at most one per unit, and held by no unit in the shop;
 * serials leaving are each in stock on the variant they leave. The ledger and the database check the same again.
 */
@Injectable()
export class SerialEntryService {
  constructor(@Inject(SERIAL_STORE) private readonly serials: SerialStore) {}

  async arriving(
    tx: Transaction,
    tenantId: string,
    entered: readonly string[] | undefined,
    format: SerialFormat,
    field: string,
    units: number,
  ): Promise<string[]> {
    if (!entered || entered.length === 0) return [];
    const serials = this.read(entered, format, field, units);
    const taken = await this.taken(tx, tenantId, serials);
    this.refuse(
      'conflict',
      entered.flatMap((raw, index): InvalidField[] =>
        taken.has(normalizeSerial(raw, format))
          ? [
              {
                field: `${field}.${String(index)}`,
                problem: ServerFieldProblemCode.Taken,
                messageKey: 'SerialTaken',
              },
            ]
          : [],
      ),
    );
    return serials;
  }

  async leaving(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    entered: readonly string[] | undefined,
    format: SerialFormat,
    field: string,
    units: number,
  ): Promise<string[]> {
    if (!entered || entered.length === 0) return [];
    const serials = this.read(entered, format, field, units);
    const inStock = new Set(
      (await this.serials.findHeld(tx, tenantId, serials))
        .filter((row) => row.variantId === variantId && row.status === SerialStatus.InStock)
        .map((row) => row.serial),
    );
    this.refuse(
      'validation_error',
      entered.flatMap((raw, index): InvalidField[] =>
        inStock.has(normalizeSerial(raw, format))
          ? []
          : [
              {
                field: `${field}.${String(index)}`,
                problem: ServerFieldProblemCode.NotFound,
                messageKey: 'SerialNotFound',
              },
            ],
      ),
    );
    return serials;
  }

  /** INV-14: which of these serials (as stored) a unit the shop holds already has. */
  async taken(tx: Transaction, tenantId: string, serials: string[]): Promise<Set<string>> {
    return new Set((await this.serials.findHeld(tx, tenantId, serials)).map((row) => row.serial));
  }

  private read(
    entered: readonly string[],
    format: SerialFormat,
    field: string,
    units: number,
  ): string[] {
    const { serials, problems } = readSerials(entered, format, field);
    this.refuse('validation_error', problems);
    if (serials.length > units) {
      this.refuse('validation_error', [
        { field, problem: FieldProblemCode.TooMany, max: units, messageKey: 'TooManySerials' },
      ]);
    }
    return serials;
  }

  /** A serial another unit holds is a conflict with what is stored; anything else, a request to fix. */
  private refuse(code: 'validation_error' | 'conflict', problems: InvalidField[]): void {
    if (problems.length > 0) throw new FieldsError(problems, code);
  }
}

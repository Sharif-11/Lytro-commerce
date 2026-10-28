import { normalizeSerial, serialProblem, type SerialFormat } from '@lytronix/validators';

/**
 * A new batch-tracked product's opening batch as its sheet holds it while it is typed (Part 15's `pf-sh-batch`; INV-12,
 * INV-10): its code and expiry, both optional, and what each unit cost. The quantity is the opening stock's.
 */
export interface OpeningBatch {
  code: string;
  /** A calendar day, YYYY-MM-DD; empty for none. */
  expiresOn: string;
  unitCost: string;
}

export const NO_BATCH: OpeningBatch = { code: '', expiresOn: '', unitCost: '' };

/** The batch as the server takes it: what was typed of it, or nothing. */
export function batchBody(batch: OpeningBatch): { batchCode?: string; expiresOn?: string } | null {
  const code = batch.code.trim();
  const body = {
    ...(code === '' ? {} : { batchCode: code }),
    ...(batch.expiresOn === '' ? {} : { expiresOn: batch.expiresOn }),
  };
  return Object.keys(body).length > 0 ? body : null;
}

/** INV-10: what each unit cost, as the server takes it; null when not typed. */
export const unitCostOf = (batch: OpeningBatch): number | null =>
  batch.unitCost.trim() === '' ? null : Number(batch.unitCost.trim());

/** INV-23 (Part 16): why one entered serial is left out. */
export type SerialFlag = 'notImei' | 'badImei' | 'badChars' | 'tooLong' | 'twice' | 'taken';

/** One entered serial, as it is stored and compared, and why it is left out; null when it is kept. */
export interface SerialLine {
  code: string;
  flag: SerialFlag | null;
}

const FLAGS = {
  not_imei: 'notImei',
  bad_check_digit: 'badImei',
  bad_characters: 'badChars',
  too_long: 'tooLong',
} as const;

/** A pasted list: one per line, or separated by commas, semicolons or tabs (Part 16). */
export const splitList = (text: string): string[] =>
  text
    .split(/[\n\r,;\t]+/)
    .map((each) => each.trim())
    .filter((each) => each !== '');

/** INV-14: how many units the typed opening stock is, so how many serials it takes; none for nothing typed. */
export function unitsOf(typed: string): number {
  const amount = Number(typed.trim());
  return typed.trim() !== '' && Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
}

/** The serials kept: the lines nothing is wrong with. */
export const keptOf = (lines: readonly SerialLine[]): string[] =>
  lines.filter((line) => line.flag === null).map((line) => line.code);

/**
 * Entered serials added to the list, each checked as it comes: by its format, then against those already in it and in
 * the product's other variants (`others`), as the server checks them. The list stops when the units are all named;
 * what did not fit comes back as `rest`.
 */
export function addSerials(
  lines: readonly SerialLine[],
  entered: readonly string[],
  format: SerialFormat,
  units: number,
  others: ReadonlySet<string>,
): { lines: SerialLine[]; rest: string[] } {
  const next = [...lines];
  const rest: string[] = [];
  for (const raw of entered) {
    const code = normalizeSerial(raw, format);
    const problem = serialProblem(raw, format);
    if (problem === 'empty') continue;
    if (keptOf(next).length >= units) {
      rest.push(raw);
      continue;
    }
    const twice = next.some((line) => line.code === code) || others.has(code);
    next.push({ code, flag: problem ? FLAGS[problem] : twice ? 'twice' : null });
  }
  return { lines: next, rest };
}

/**
 * What a new variant's stock on the shelf carries, as the server takes it: on a batch-tracked product its batch and
 * its unit cost (INV-12, INV-10), on a serial-numbered one the serials kept (INV-14). Nothing without stock.
 */
export function openingExtras(
  stock: number | undefined,
  batch: OpeningBatch,
  serials: readonly SerialLine[],
  kind: { batch: boolean; serial: boolean },
) {
  if (stock === undefined || stock <= 0) return {};
  const described = kind.batch ? batchBody(batch) : null;
  const cost = kind.batch ? unitCostOf(batch) : null;
  const kept = kind.serial ? keptOf(serials) : [];
  return {
    ...(described ? { openingBatch: described } : {}),
    ...(cost === null ? {} : { openingUnitCost: cost }),
    ...(kept.length > 0 ? { openingSerials: kept } : {}),
  };
}

/** The kept serials the shop holds already (POST /serials/check), flagged. */
export const markTaken = (lines: readonly SerialLine[], taken: readonly string[]): SerialLine[] =>
  lines.map((line) =>
    line.flag === null && taken.includes(line.code) ? { ...line, flag: 'taken' } : line,
  );

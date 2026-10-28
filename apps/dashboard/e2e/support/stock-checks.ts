import type { Language } from './mock-api';
import { nameIn, type ProductFixture, type ProductsFixture } from './products';
import { matrixOf, variantPart, type VariantFixture } from './variants';

// Stock checks against a mocked API (Slice 11.9 step 4; INV-07): the shop's checks, newest first, one check with its
// lines named by their products' splits, and a new count recorded -- each difference changing the fixture's stock, as
// "counted again", the IMEIs not found leaving it -- so the reads after it show what was counted.

/** One counted line as kept: a variant whole, or one batch of it, with what was expected and counted. */
export interface CheckLineFixture {
  variantId: string;
  batchId?: string;
  expected: number;
  counted: number;
}

export interface CheckFixture {
  id: string;
  number: number;
  note: string | null;
  actor: { userId: string; name: string } | null;
  createdAt: string;
  lines: CheckLineFixture[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A variant of the fixture's products, with the product it belongs to. */
function variantOf(
  fixture: ProductsFixture,
  variantId: string,
): { product: ProductFixture; row: VariantFixture } | null {
  for (const product of fixture.products) {
    const row = matrixOf(product).rows.find((each) => each.id === variantId);
    if (row) return { product, row };
  }
  return null;
}

/** The sketch's three checks (#12 yesterday with two changed, #11 matched, #10 the opening count), on its products. */
function drawnChecks(fixture: ProductsFixture, language: Language): CheckFixture[] {
  const bn = language === 'bn';
  const counted = (product: ProductFixture, changes: Record<number, number> = {}) =>
    matrixOf(product).rows.map((row, at) => ({
      variantId: row.id,
      expected: row.onHand ?? 0,
      counted: (row.onHand ?? 0) + (changes[at] ?? 0),
    }));
  const live = fixture.products.filter((product) => !product.archived);
  const [first, ...rest] = live;
  const rumana = { userId: 'u-rumana', name: bn ? 'রুমানা' : 'Rumana' };
  const kamal = { userId: 'u-kamal', name: bn ? 'কামাল' : 'Kamal' };
  return [
    {
      id: 'sc-12',
      number: 12,
      note: bn ? 'মাস শেষের গণনা' : 'Month-end count',
      actor: rumana,
      createdAt: new Date(Date.now() - DAY_MS).toISOString(),
      lines: [
        ...(first ? counted(first, { 1: -1, 3: 1 }) : []),
        ...rest.flatMap((product) => counted(product)),
      ],
    },
    {
      id: 'sc-11',
      number: 11,
      note: null,
      actor: kamal,
      createdAt: new Date(Date.now() - 30 * DAY_MS).toISOString(),
      lines: rest.slice(0, 2).flatMap((product) => counted(product)),
    },
    {
      id: 'sc-10',
      number: 10,
      note: bn ? 'ওপেনিং গণনা' : 'Opening count',
      actor: rumana,
      createdAt: new Date(Date.now() - 56 * DAY_MS).toISOString(),
      lines: live.flatMap((product, at) => counted(product, at === 1 ? { 0: -2 } : {})),
    },
  ];
}

/** A check as the server reads it: its lines named, each counted product's splits, its totals (costs if seen). */
function checkView(
  check: CheckFixture,
  fixture: ProductsFixture,
  language: Language,
  costs: boolean,
): Record<string, unknown> {
  const lines = check.lines.map((line) => {
    const found = variantOf(fixture, line.variantId);
    const batch = found?.product.batches?.find((each) => each.id === line.batchId);
    const unitCost = found?.row.avgCost ?? null;
    const difference = line.counted - line.expected;
    return {
      productId: found?.product.id ?? '',
      variantId: line.variantId,
      productName: found ? nameIn(found.product, language) : null,
      optionIds: found?.row.optionIds ?? [],
      batch: batch
        ? { id: batch.id, batchCode: batch.batchCode, expiresOn: batch.expiresOn }
        : null,
      expected: String(line.expected),
      counted: String(line.counted),
      difference: String(difference),
      ...(costs
        ? {
            unitCost,
            value: unitCost === null ? null : (difference * Number(unitCost)).toFixed(2),
          }
        : {}),
    };
  });
  const changed = lines.filter((line) => line.difference !== '0');
  const valued = (sign: number) =>
    changed
      .filter((line) => Math.sign(Number(line.difference)) === sign && line.value)
      .reduce((total, line) => total + Math.abs(Number(line.value)), 0)
      .toFixed(2);
  const productIds = [...new Set(lines.map((line) => line.productId))];
  return {
    id: check.id,
    number: check.number,
    note: check.note,
    actor: check.actor,
    createdAt: check.createdAt,
    totals: {
      lines: lines.length,
      changed: changed.length,
      ...(costs ? { valueGained: valued(1), valueLost: valued(-1), unknownCost: 0 } : {}),
    },
    lines,
    products: productIds.flatMap((productId) => {
      const product = fixture.products.find((each) => each.id === productId);
      return product
        ? [{ productId, splits: variantPart(product, fixture).variantAttributes }]
        : [];
    }),
  };
}

/** The checks' reads and the new count; undefined for any other request. */
export function checksAnswer(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  fixture: ProductsFixture,
  language: Language,
  costs: boolean,
): { data: unknown } | undefined {
  const checks = (fixture.checks ??= drawnChecks(fixture, language));
  if (method === 'GET' && path === '/stock-checks') {
    const summaries = [...checks]
      .sort((a, b) => b.number - a.number)
      .map((check) => {
        const { id, number, note, actor, createdAt, totals } = checkView(
          check,
          fixture,
          language,
          costs,
        );
        return { id, number, note, actor, createdAt, totals };
      });
    return {
      data: { checks: summaries, page: 1, limit: 20, total: summaries.length, pages: 1 },
    };
  }
  const one = /^\/stock-checks\/([^/]+)$/.exec(path);
  const found = checks.find((check) => check.id === one?.[1]);
  if (method === 'GET' && found) return { data: checkView(found, fixture, language, costs) };
  if (method === 'POST' && path === '/stock-checks') {
    const asked = (body?.lines ?? []) as {
      variantId: string;
      batchId?: string;
      counted: number;
      missingSerials?: string[];
    }[];
    const lines = asked.map((line) => {
      const held = variantOf(fixture, line.variantId);
      const batch = held?.product.batches?.find((each) => each.id === line.batchId);
      const expected = batch ? Number(batch.quantity) : (held?.row.onHand ?? 0);
      if (held) {
        held.row.onHand = (held.row.onHand ?? 0) + line.counted - expected;
        if (batch) batch.quantity = String(line.counted);
        for (const unit of held.row.serials ?? []) {
          if (line.missingSerials?.includes(unit.serial)) unit.status = 'written_off';
        }
      }
      return {
        variantId: line.variantId,
        ...(line.batchId ? { batchId: line.batchId } : {}),
        expected,
        counted: line.counted,
      };
    });
    const number = Math.max(0, ...checks.map((each) => each.number)) + 1;
    const check: CheckFixture = {
      id: `sc-${String(number)}`,
      number,
      note: typeof body?.note === 'string' ? body.note : null,
      actor: { userId: 'u-rumana', name: language === 'bn' ? 'রুমানা' : 'Rumana' },
      createdAt: new Date().toISOString(),
      lines,
    };
    checks.push(check);
    return { data: checkView(check, fixture, language, costs) };
  }
  return undefined;
}

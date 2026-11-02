import type { ProductsFixture } from './products';

// Tax classes against a mocked API (Slice 4.8c, TAX-01): the three Part 31 draws, VAT 5% the default.

export interface TaxFixture {
  classes: { id: string; name: string; rate: string }[];
  defaultId: string | null;
}

export const drawnTax = (): TaxFixture => ({
  classes: [
    { id: 'tx-5', name: 'VAT 5%', rate: '5.00' },
    { id: 'tx-15', name: 'VAT 15%', rate: '15.00' },
    { id: 'tx-0', name: 'Zero-rated', rate: '0.00' },
  ],
  defaultId: 'tx-5',
});

let made = 0;

/** The classes' reads and writes, each answering with the classes as they now are. */
export function taxAnswer(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  fixture: ProductsFixture,
):
  | { data: unknown }
  | {
      refused: {
        status: number;
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    }
  | undefined {
  if (!path.startsWith('/tax-classes')) return undefined;
  const tax = (fixture.tax ??= drawnTax());
  if (method === 'GET' && path === '/tax-classes') return { data: tax };
  if (method === 'POST' && path === '/tax-classes') {
    made += 1;
    tax.classes.push({
      id: `tx-new-${String(made)}`,
      name: String(body?.name),
      rate: Number(body?.rate).toFixed(2),
    });
    return { data: tax };
  }
  if (method === 'PUT' && path === '/tax-classes/default') {
    tax.defaultId = (body?.taxClassId as string | null | undefined) ?? null;
    return { data: tax };
  }
  const id = path.split('/')[2] ?? '';
  const each = tax.classes.find((one) => one.id === id);
  if (!each) return { refused: { status: 404, code: 'not_found', message: 'Not found' } };
  if (method === 'PATCH') {
    if (typeof body?.name === 'string') each.name = body.name;
    if (body?.rate !== undefined) each.rate = Number(body.rate).toFixed(2);
    return { data: tax };
  }
  if (method === 'DELETE') {
    const users = fixture.products.filter((product) => product.taxClassId === id).length;
    if (users > 0) {
      return {
        refused: {
          status: 409,
          code: 'conflict',
          message: 'Some products use this class.',
          details: { products: users },
        },
      };
    }
    tax.classes = tax.classes.filter((one) => one.id !== id);
    if (tax.defaultId === id) tax.defaultId = null;
    return { data: tax };
  }
  return undefined;
}

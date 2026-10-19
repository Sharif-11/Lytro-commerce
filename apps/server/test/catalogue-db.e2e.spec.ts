import 'dotenv/config';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, seedShop } from './support/database';

// Phase 3 Slices 1 and 1b: the catalogue's guarantees at the data layer, written as the application role inside
// one shop's context -- the way the server writes -- so they hold even for a write that skips the API. ATL-01 to
// ATL-04, ATR-14, ATR-16, ATR-18, PRD-17, PST-04, PST-05, SEC-02, DAT-03. Runs only when DATABASE_TEST_ADMIN_URL
// is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_catalogue_db_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let admin: pg.Client;
let app: pg.Client;
let shopA: string;
let shopB: string;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  app = new pg.Client({ connectionString: appDbUrl });
  await app.connect();
  shopA = await seedShop(admin, 'Catalogue A', 'catalogue-a');
  shopB = await seedShop(admin, 'Catalogue B', 'catalogue-b');
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.end();
  await admin.end();
});

type Query = <R extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<pg.QueryResult<R>>;

/** Runs the work as the application role inside one shop's context, in one transaction that is rolled back. */
async function asShop<T>(tenantId: string, work: (query: Query) => Promise<T>): Promise<T> {
  await app.query('BEGIN');
  try {
    await app.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    return await work((sql, params) => app.query(sql, params));
  } finally {
    await app.query('ROLLBACK');
  }
}

async function platformAttribute(name: string): Promise<string> {
  const result = await admin.query<{ id: string }>(
    'SELECT id FROM tenant.attributes WHERE tenant_id IS NULL AND name = $1',
    [name],
  );
  return result.rows[0]?.id ?? '';
}

async function product(query: Query, tenantId: string, slug: string): Promise<string> {
  const result = await query<{ id: string }>(
    "INSERT INTO tenant.products (tenant_id, name, slug, base_price) VALUES ($1, 'Tee', $2, 100) RETURNING id",
    [tenantId, slug],
  );
  return result.rows[0]?.id ?? '';
}

async function ownAttribute(
  query: Query,
  tenantId: string,
  name: string,
  dataType = 'enum_single',
): Promise<string> {
  const result = await query<{ id: string }>(
    'INSERT INTO tenant.attributes (tenant_id, name, data_type) VALUES ($1, $2, $3) RETURNING id',
    [tenantId, name, dataType],
  );
  return result.rows[0]?.id ?? '';
}

async function option(
  query: Query,
  tenantId: string,
  attributeId: string,
  value: string,
): Promise<string> {
  const result = await query<{ id: string }>(
    'INSERT INTO tenant.attribute_options (tenant_id, attribute_id, value) VALUES ($1, $2, $3) RETURNING id',
    [tenantId, attributeId, value],
  );
  return result.rows[0]?.id ?? '';
}

function splitBy(query: Query, tenantId: string, productId: string, attributeId: string) {
  return query(
    "INSERT INTO tenant.product_attributes (tenant_id, product_id, attribute_id, role) VALUES ($1, $2, $3, 'variant_defining')",
    [tenantId, productId, attributeId],
  );
}

describeIfDatabase('every shop-owned table sits behind row-level security (DAT-03, SEC-02)', () => {
  it('has it enabled, forced, and at least one policy on every table in the tenant schema', async () => {
    const result = await admin.query<{
      table: string;
      enabled: boolean;
      forced: boolean;
      policies: number;
    }>(`
      SELECT c.relname AS table, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
        (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'tenant' AND p.tablename = c.relname) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'tenant' AND c.relkind = 'r'
      ORDER BY c.relname`);
    const unprotected = result.rows.filter(
      (row) => !row.enabled || !row.forced || row.policies === 0,
    );
    expect(unprotected).toEqual([]);
    expect(result.rows.map((row) => row.table)).toEqual(
      expect.arrayContaining([
        'products',
        'product_variants',
        'attributes',
        'attribute_options',
        'categories',
        'size_charts',
        'option_sets',
      ]),
    );
  });
});

describeIfDatabase('the attribute library has two scopes (ATL-01)', () => {
  it("lets a shop read the platform's attributes and its own, never another shop's", async () => {
    // A shop may add its own (rolled back here); the one read below is added by the admin.
    const madeByShop = await asShop(shopA, (query) => ownAttribute(query, shopA, 'Thread count'));
    const real = await admin.query<{ id: string }>(
      "INSERT INTO tenant.attributes (tenant_id, name, data_type) VALUES ($1, 'Thread count', 'text') RETURNING id",
      [shopA],
    );
    expect(madeByShop).not.toBe('');
    const ownId = real.rows[0]?.id ?? '';

    const seenByA = await asShop(shopA, (query) =>
      query<{ name: string }>(
        "SELECT name FROM tenant.attributes WHERE name IN ('Size', 'Thread count')",
      ),
    );
    expect(seenByA.rows.map((row) => row.name).sort()).toEqual(['Size', 'Thread count']);
    const seenByB = await asShop(shopB, (query) =>
      query<{ id: string }>('SELECT id FROM tenant.attributes WHERE id = $1', [ownId]),
    );
    expect(seenByB.rows).toHaveLength(0);
  });

  it('refuses a shop writing a platform row, or changing one', async () => {
    await expect(
      asShop(shopA, (query) =>
        query(
          "INSERT INTO tenant.attributes (tenant_id, name, data_type) VALUES (NULL, 'Sneaky', 'text')",
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const size = await platformAttribute('Size');
    const changed = await asShop(shopA, (query) =>
      query("UPDATE tenant.attributes SET name = 'Hacked' WHERE id = $1", [size]),
    );
    expect(changed.rowCount).toBe(0);
  });

  it('never changes an attribute type once made', async () => {
    await expect(
      asShop(shopA, async (query) => {
        const id = await ownAttribute(query, shopA, 'Finish');
        await query("UPDATE tenant.attributes SET data_type = 'enum_multi' WHERE id = $1", [id]);
      }),
    ).rejects.toThrow(/keeps its type/);
  });

  it('gives options only to an attribute that holds them', async () => {
    await expect(
      asShop(shopA, async (query) => {
        const id = await ownAttribute(query, shopA, 'Notes', 'text');
        await option(query, shopA, id, 'anything');
      }),
    ).rejects.toThrow(/has no options/);
  });
});

describeIfDatabase(
  "no shop can point at another shop's attribute or option, even knowing its id (SEC-02)",
  () => {
    it("refuses another shop's attribute on a product, an option on it, and its option on a variant", async () => {
      const foreign = await admin.query<{ id: string }>(
        "INSERT INTO tenant.attributes (tenant_id, name, data_type) VALUES ($1, 'Secret blend', 'enum_single') RETURNING id",
        [shopA],
      );
      const foreignAttribute = foreign.rows[0]?.id ?? '';
      // Shop A's own value of the platform's Size: a real option of Size, so only the scope check can refuse it.
      const size = await platformAttribute('Size');
      const foreignOption = await admin.query<{ id: string }>(
        "INSERT INTO tenant.attribute_options (tenant_id, attribute_id, value) VALUES ($1, $2, 'Shop A only') RETURNING id",
        [shopA, size],
      );

      await expect(
        asShop(shopB, async (query) => {
          const productId = await product(query, shopB, 'b-tee');
          await splitBy(query, shopB, productId, foreignAttribute);
        }),
      ).rejects.toThrow(/not available to this shop/);

      await expect(
        asShop(shopB, (query) => option(query, shopB, foreignAttribute, 'Silver')),
      ).rejects.toThrow(/not available to this shop/);

      await expect(
        asShop(shopB, async (query) => {
          const productId = await product(query, shopB, 'b-tee-2');
          await splitBy(query, shopB, productId, size);
          const variant = await query<{ id: string }>(
            "INSERT INTO tenant.product_variants (tenant_id, product_id, combination_key) VALUES ($1, $2, 'x') RETURNING id",
            [shopB, productId],
          );
          await query(
            'INSERT INTO tenant.variant_attribute_values (tenant_id, product_id, variant_id, attribute_id, option_id) VALUES ($1, $2, $3, $4, $5)',
            [shopB, productId, variant.rows[0]?.id, size, foreignOption.rows[0]?.id],
          );
        }),
      ).rejects.toThrow(/option .* is not available to this shop/);
    });
  },
);

describeIfDatabase(
  'variant rules hold in the database itself (ATL-02, ATL-03, ATL-04, ATR-14)',
  () => {
    it('refuses an attribute that takes several values as variant-defining, even written directly (ATL-02)', async () => {
      const skinType = await platformAttribute('Skin type');
      await expect(
        asShop(shopA, async (query) => {
          const productId = await product(query, shopA, 'cream');
          await splitBy(query, shopA, productId, skinType);
        }),
      ).rejects.toThrow(/cannot define variants/);
    });

    it('refuses a fourth variant-defining attribute (ATL-03)', async () => {
      const ids = await Promise.all(['Size', 'Color', 'Fabric', 'Material'].map(platformAttribute));
      await expect(
        asShop(shopA, async (query) => {
          const productId = await product(query, shopA, 'four-way');
          for (const id of ids) await splitBy(query, shopA, productId, id);
        }),
      ).rejects.toThrow(/at most 3 variant-defining/);
    });

    it('refuses a 101st live variant, and a retired one coming back past the limit (ATL-03)', async () => {
      await expect(
        asShop(shopA, async (query) => {
          const productId = await product(query, shopA, 'hundred');
          await query(
            `INSERT INTO tenant.product_variants (tenant_id, product_id, combination_key)
           SELECT $1, $2, 'k' || n FROM generate_series(1, 100) n`,
            [shopA, productId],
          );
          await query(
            "INSERT INTO tenant.product_variants (tenant_id, product_id, combination_key) VALUES ($1, $2, 'one-more')",
            [shopA, productId],
          );
        }),
      ).rejects.toThrow(/at most 100 variants/);

      await expect(
        asShop(shopA, async (query) => {
          const productId = await product(query, shopA, 'hundred-again');
          await query(
            `INSERT INTO tenant.product_variants (tenant_id, product_id, combination_key, deleted_at)
           VALUES ($1, $2, 'old', now())`,
            [shopA, productId],
          );
          await query(
            `INSERT INTO tenant.product_variants (tenant_id, product_id, combination_key)
           SELECT $1, $2, 'k' || n FROM generate_series(1, 100) n`,
            [shopA, productId],
          );
          await query(
            "UPDATE tenant.product_variants SET deleted_at = NULL WHERE product_id = $1 AND combination_key = 'old'",
            [productId],
          );
        }),
      ).rejects.toThrow(/at most 100 variants/);
    });

    it('refuses a second variant with the same combination (ATL-04, ATR-06)', async () => {
      await expect(
        asShop(shopA, async (query) => {
          const productId = await product(query, shopA, 'red-l');
          const sql =
            "INSERT INTO tenant.product_variants (tenant_id, product_id, combination_key) VALUES ($1, $2, 'size=l&color=red')";
          await query(sql, [shopA, productId]);
          await query(sql, [shopA, productId]);
        }),
      ).rejects.toThrow(/product_variants_product_combination_key/);
    });

    it('refuses a variant value for an attribute that does not split the product', async () => {
      const color = await platformAttribute('Color');
      await expect(
        asShop(shopA, async (query) => {
          const productId = await product(query, shopA, 'unsplit');
          // Color describes the product, so the value row's keys all hold; only its role is wrong.
          await query(
            "INSERT INTO tenant.product_attributes (tenant_id, product_id, attribute_id, role) VALUES ($1, $2, $3, 'informational')",
            [shopA, productId, color],
          );
          const red = await option(query, shopA, color, 'Red');
          const variant = await query<{ id: string }>(
            'INSERT INTO tenant.product_variants (tenant_id, product_id) VALUES ($1, $2) RETURNING id',
            [shopA, productId],
          );
          await query(
            'INSERT INTO tenant.variant_attribute_values (tenant_id, product_id, variant_id, attribute_id, option_id) VALUES ($1, $2, $3, $4, $5)',
            [shopA, productId, variant.rows[0]?.id, color, red],
          );
        }),
      ).rejects.toThrow(/does not define this product's variants/);
    });
  },
);

/** Runs the work as the application role with platform curation turned on, as the operator's routes do. */
async function asCurator<T>(
  work: (query: Query) => Promise<T>,
  tenantId: string | null = null,
): Promise<T> {
  await app.query('BEGIN');
  try {
    await app.query("SELECT set_config('app.platform_curation', 'on', true)");
    if (tenantId !== null) {
      await app.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    }
    return await work((sql, params) => app.query(sql, params));
  } finally {
    await app.query('ROLLBACK');
  }
}

describeIfDatabase(
  'the operator curates the platform rows, and only those (PST-04, ATL-01, ATR-16)',
  () => {
    it('lets a curating transaction write platform attributes, options and option sets', async () => {
      const renamed = await asCurator(async (query) => {
        const made = await query<{ id: string }>(
          "INSERT INTO tenant.attributes (tenant_id, name, data_type) VALUES (NULL, 'Sleeve', 'enum_single') RETURNING id",
        );
        const id = made.rows[0]?.id ?? '';
        await query(
          "INSERT INTO tenant.attribute_options (tenant_id, attribute_id, value) VALUES (NULL, $1, 'Long')",
          [id],
        );
        await query(
          "INSERT INTO tenant.option_sets (tenant_id, name, options) VALUES (NULL, 'Sleeves', ARRAY['Long', 'Short'])",
        );
        return (
          await query("UPDATE tenant.attributes SET name = 'Sleeve length' WHERE id = $1", [id])
        ).rowCount;
      });
      expect(renamed).toBe(1);
    });

    it("never lets curation write a shop's row, with or without a shop's context", async () => {
      await expect(
        asCurator((query) =>
          query(
            "INSERT INTO tenant.attributes (tenant_id, name, data_type) VALUES ($1, 'Sneaky', 'text')",
            [shopB],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        asCurator(
          (query) =>
            query(
              "INSERT INTO tenant.option_sets (tenant_id, name, options) VALUES ($1, 'Sneaky', ARRAY['A'])",
              [shopB],
            ),
          shopA,
        ),
      ).rejects.toThrow(/row-level security/);
      const own = await admin.query<{ id: string }>(
        "INSERT INTO tenant.attributes (tenant_id, name, data_type) VALUES ($1, 'Only B', 'text') RETURNING id",
        [shopB],
      );
      const changed = await asCurator((query) =>
        query("UPDATE tenant.attributes SET name = 'Hacked' WHERE id = $1", [own.rows[0]?.id]),
      );
      expect(changed.rowCount).toBe(0);
    });

    it('refuses a platform option set to a shop that has not turned curation on', async () => {
      await expect(
        asShop(shopA, (query) =>
          query(
            "INSERT INTO tenant.option_sets (tenant_id, name, options) VALUES (NULL, 'Sneaky', ARRAY['A'])",
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  },
);

describeIfDatabase('option sets have the two scopes (ATR-16)', () => {
  it("shows a shop the platform's sets and its own, never another shop's", async () => {
    await admin.query(
      "INSERT INTO tenant.option_sets (tenant_id, name, options) VALUES ($1, 'B sizes', ARRAY['1', '2'])",
      [shopB],
    );
    const seen = await asShop(shopA, (query) =>
      query<{ name: string }>('SELECT name FROM tenant.option_sets ORDER BY sort_order, name'),
    );
    const names = seen.rows.map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(['S–XXL', 'Shoe 38–44', 'Common colors']));
    expect(names).not.toContain('B sizes');
  });

  it('holds 1 to 50 values, and names a shop type only on a platform set', async () => {
    await expect(
      asShop(shopA, (query) =>
        query(
          "INSERT INTO tenant.option_sets (tenant_id, name, options) VALUES ($1, 'Empty', '{}')",
          [shopA],
        ),
      ),
    ).rejects.toThrow(/option_sets_options_check/);
    await expect(
      asShop(shopA, (query) =>
        query(
          "INSERT INTO tenant.option_sets (tenant_id, name, preset_key, options) VALUES ($1, 'Mine', 'clothing', ARRAY['A'])",
          [shopA],
        ),
      ),
    ).rejects.toThrow(/option_sets_preset_check/);
  });
});

describeIfDatabase('size charts (PRD-17)', () => {
  it('belong to exactly one product or one category, one chart each', async () => {
    await expect(
      asShop(shopA, (query) =>
        query('INSERT INTO tenant.size_charts (tenant_id, table_rows) VALUES ($1, \'[["S"]]\')', [
          shopA,
        ]),
      ),
    ).rejects.toThrow(/size_charts_owner_check/);
    await expect(
      asShop(shopA, async (query) => {
        const productId = await product(query, shopA, 'charted');
        const sql =
          'INSERT INTO tenant.size_charts (tenant_id, product_id, table_rows) VALUES ($1, $2, \'[["S"]]\')';
        await query(sql, [shopA, productId]);
        await query(sql, [shopA, productId]);
      }),
    ).rejects.toThrow(/size_charts_product_idx/);
  });

  it("cannot hang on another shop's product", async () => {
    const theirs = await admin.query<{ id: string }>(
      "INSERT INTO tenant.products (tenant_id, name, slug, base_price) VALUES ($1, 'Theirs', 'theirs-chart', 1) RETURNING id",
      [shopB],
    );
    await expect(
      asShop(shopA, (query) =>
        query(
          'INSERT INTO tenant.size_charts (tenant_id, product_id, table_rows) VALUES ($1, $2, \'[["S"]]\')',
          [shopA, theirs.rows[0]?.id],
        ),
      ),
    ).rejects.toThrow(/size_charts_product_fk/);
  });
});

describeIfDatabase('swatches and the seeded library (ATR-18, ATR-16, PST-05)', () => {
  it('stores only a #RRGGBB swatch', async () => {
    const color = await platformAttribute('Color');
    await expect(
      asShop(shopA, (query) =>
        query(
          "INSERT INTO tenant.attribute_options (tenant_id, attribute_id, value, swatch_color) VALUES ($1, $2, 'Teal', '#12345G')",
          [shopA, color],
        ),
      ),
    ).rejects.toThrow(/attribute_options_swatch_check/);
  });

  it('seeds the common colours with their swatches, the option sets and the up-front fields', async () => {
    const colours = await admin.query<{ value: string; swatch_color: string | null }>(
      `SELECT o.value, o.swatch_color FROM tenant.attribute_options o
       JOIN tenant.attributes a ON a.id = o.attribute_id
       WHERE a.tenant_id IS NULL AND a.name = 'Color' AND o.tenant_id IS NULL ORDER BY o.sort_order`,
    );
    expect(colours.rows).toHaveLength(18);
    expect(colours.rows[2]).toEqual({ value: 'Red', swatch_color: '#D32F2F' });
    expect(colours.rows.every((row) => row.swatch_color !== null)).toBe(true);

    const sets = await admin.query<{ name: string; preset_key: string | null; options: string[] }>(
      'SELECT name, preset_key, options FROM tenant.option_sets WHERE tenant_id IS NULL ORDER BY sort_order',
    );
    expect(sets.rows.map((row) => [row.name, row.preset_key, row.options.length])).toEqual([
      ['S–XXL', 'clothing', 5],
      ['Shoe 38–44', 'shoes_bags', 7],
      ['Common colors', null, 18],
    ]);

    const presets = await admin.query<{ key: string; up_front_fields: string[] }>(
      "SELECT key, up_front_fields FROM control.business_type_presets WHERE key IN ('electronics', 'clothing', 'other') ORDER BY key",
    );
    expect(presets.rows).toEqual([
      { key: 'clothing', up_front_fields: ['sizeChart'] },
      { key: 'electronics', up_front_fields: ['serialTracked', 'itemCondition'] },
      { key: 'other', up_front_fields: [] },
    ]);
  });
});

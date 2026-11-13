import { describe, expect, it } from 'vitest';
import { MigrationCheck, type MigrationHistory } from '../src/check-migrations';
import {
  migrationOf,
  orderProblems,
  readMigrationFiles,
  statementsOf,
  type MigrationFile,
} from '../src/migration-files';
import { migrationProblems, type PreviousRelease } from '../src/migration-rules';

// ENGINEERING-STANDARDS §5 (Phase 9 Slice 9.7): what CI refuses in a new migration, and what it lets through.
const BREAK = '\n--> statement-breakpoint\n';
const file = (sql: string, tag = '0140_change'): MigrationFile =>
  migrationOf(tag, 1_900_000_000_000, sql);
const problemsOf = (sql: string, previous: PreviousRelease | null = null): string[] =>
  migrationProblems(file(sql), previous);

const PREVIOUS: PreviousRelease = {
  tags: new Set(['0138_orders_total_minor']),
  tables: new Map([['tenant.orders', new Set(['id', 'total', 'total_minor'])]]),
};

describe('reading a migration (statementsOf)', () => {
  it('blanks comments and quoted text, and opens up a DO block but not a function body', () => {
    const sql = `-- a comment; with a semicolon
      UPDATE tenant.orders SET note = 'a; b' WHERE id = '1';
      DO $$ BEGIN
        ALTER TABLE "tenant"."orders" ADD CONSTRAINT "fk" FOREIGN KEY ("x") REFERENCES "tenant"."y"("id");
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      CREATE FUNCTION tenant.f() RETURNS trigger AS $body$ BEGIN UPDATE tenant.orders SET x = 1; END $body$ LANGUAGE plpgsql;`;
    expect(statementsOf(sql)).toEqual([
      "UPDATE tenant.orders SET note = '' WHERE id = ''",
      'ALTER TABLE "tenant"."orders" ADD CONSTRAINT "fk" FOREIGN KEY ("x") REFERENCES "tenant"."y"("id")',
      "CREATE FUNCTION tenant.f() RETURNS trigger AS '' LANGUAGE plpgsql",
    ]);
  });

  it('reads the markers and the parts between breakpoints, and hashes \\r\\n and \\n alike', () => {
    const crlf = migrationOf(
      '0140_x',
      1,
      '-- outside-transaction\r\nSELECT 1;\r\n--> statement-breakpoint\r\nSELECT 2;',
    );
    const lf = migrationOf(
      '0140_x',
      1,
      '-- outside-transaction\nSELECT 1;\n--> statement-breakpoint\nSELECT 2;',
    );
    expect(crlf.outsideTransaction).toBe(true);
    expect(crlf.statements).toHaveLength(2);
    expect(crlf.hash).toBe(lf.hash);
    expect(crlf.recordedAs).toContain(lf.hash);
    expect(file('-- contract-of: 0138_orders_total_minor\nSELECT 1;').contractOf).toBe(
      '0138_orders_total_minor',
    );
  });
});

describe('what a new migration may not do outside a contract step', () => {
  it.each([
    [
      'drops a column',
      'ALTER TABLE "tenant"."orders" DROP COLUMN "note";',
      'drops tenant.orders.note',
    ],
    ['drops a table', 'DROP TABLE "tenant"."old_things";', 'drops the table tenant.old_things'],
    [
      'renames a column',
      'ALTER TABLE tenant.orders RENAME COLUMN note TO notes;',
      'renames tenant.orders.note',
    ],
    [
      'renames a table',
      'ALTER TABLE tenant.orders RENAME TO sales;',
      'renames the table tenant.orders',
    ],
    [
      'changes a type',
      'ALTER TABLE "tenant"."orders" ALTER COLUMN "total" SET DATA TYPE bigint;',
      "changes a column's type",
    ],
    [
      'requires a column',
      'ALTER TABLE "tenant"."orders" ALTER COLUMN "note" SET NOT NULL;',
      'makes a column of tenant.orders required',
    ],
    [
      'renames an enum value',
      "ALTER TYPE tenant.order_state RENAME VALUE 'new' TO 'placed';",
      'renames a value',
    ],
    ['updates rows', "UPDATE tenant.orders SET note = 'x';", 'updates rows of tenant.orders'],
    ['deletes rows', 'DELETE FROM tenant.orders;', 'deletes rows of tenant.orders'],
    [
      'writes rows of a shop',
      'INSERT INTO tenant.orders (id) VALUES (1);',
      'writes rows of tenant.orders',
    ],
    [
      'updates control rows unmarked',
      'UPDATE control.plans SET suggested = true;',
      'updates rows of control.plans',
    ],
  ])('%s', (_name, sql, expected) => {
    const found = problemsOf(sql);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(expected);
    expect(found[0]).toContain('only as the planned contract');
  });

  it('lets a contract step do them, once the previous release no longer has what it removes', () => {
    const contract = '-- contract-of: 0138_orders_total_minor\n';
    expect(
      problemsOf(`${contract}ALTER TABLE "tenant"."orders" DROP COLUMN "note";`, PREVIOUS),
    ).toEqual([]);
    expect(
      problemsOf(
        `${contract}ALTER TABLE tenant.orders ALTER COLUMN total_minor SET NOT NULL;`,
        PREVIOUS,
      ),
    ).toEqual([]);
    expect(
      problemsOf(`${contract}ALTER TABLE "tenant"."orders" DROP COLUMN "total";`, PREVIOUS),
    ).toEqual([
      "0140_change drops tenant.orders.total, which the previous release's schema still has: stop reading and writing it, and take it out of the schema, a release first",
    ]);
    expect(
      problemsOf(
        '-- contract-of: 0139_same_pull_request\nALTER TABLE tenant.orders DROP COLUMN note;',
        PREVIOUS,
      ),
    ).toEqual([
      '0140_change is the contract of 0139_same_pull_request, which no earlier release has: the expand ships a release first',
    ]);
  });
});

describe('what locks or rewrites a table, refused even in a contract step', () => {
  it.each([
    [
      'an index built under lock',
      'CREATE INDEX IF NOT EXISTS "orders_x_idx" ON "tenant"."orders" USING btree ("x");',
      'without CONCURRENTLY',
    ],
    [
      'a concurrent build inside a transaction',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_x_idx ON tenant.orders (x);',
      "can't run inside a transaction",
    ],
    [
      'a check scanning every row',
      'ALTER TABLE tenant.orders ADD CONSTRAINT orders_total_check CHECK (total >= 0);',
      'add it NOT VALID',
    ],
    [
      'a foreign key scanning every row',
      'ALTER TABLE "tenant"."orders" ADD CONSTRAINT "fk" FOREIGN KEY ("x") REFERENCES "tenant"."y"("id");',
      'add it NOT VALID',
    ],
    [
      'a unique rule building its index',
      'ALTER TABLE tenant.orders ADD CONSTRAINT orders_x_key UNIQUE (x);',
      'USING INDEX',
    ],
    [
      'a required column with no default',
      'ALTER TABLE "tenant"."orders" ADD COLUMN "x" text NOT NULL;',
      'with no default',
    ],
    [
      'a default worked out row by row',
      'ALTER TABLE "tenant"."orders" ADD COLUMN "ref" uuid DEFAULT gen_random_uuid();',
      'rewrites the table',
    ],
    [
      'a serial column',
      'ALTER TABLE tenant.orders ADD COLUMN seq bigserial;',
      'rewrites the table',
    ],
    [
      'a new column with its own unique rule',
      'ALTER TABLE tenant.orders ADD COLUMN code text UNIQUE;',
      'its own unique rule',
    ],
  ])('%s', (_name, sql, expected) => {
    const found = problemsOf(`-- contract-of: 0138_orders_total_minor\n${sql}`, PREVIOUS);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(expected);
  });

  it('refuses validating a rule in the file that adds it, since the scan would hold the adding lock', () => {
    expect(
      problemsOf(
        `ALTER TABLE tenant.orders ADD CONSTRAINT orders_total_check CHECK (total >= 0) NOT VALID;${BREAK}ALTER TABLE tenant.orders VALIDATE CONSTRAINT orders_total_check;`,
      ),
    ).toEqual([
      '0140_change validates orders_total_check on tenant.orders in the file that adds it, so the scan holds the adding lock: validate it in a later file',
    ]);
  });

  it('holds a file outside a transaction to statements that can run again, one per part', () => {
    const outside = '-- outside-transaction\n';
    expect(
      problemsOf(
        `${outside}CREATE INDEX CONCURRENTLY IF NOT EXISTS a ON tenant.orders (x);${BREAK}DROP INDEX CONCURRENTLY IF EXISTS tenant.b;`,
      ),
    ).toEqual([]);
    expect(problemsOf(`${outside}CREATE INDEX CONCURRENTLY a ON tenant.orders (x);`)[0]).toContain(
      'which can run again',
    );
    expect(
      problemsOf(
        `${outside}CREATE INDEX CONCURRENTLY IF NOT EXISTS a ON tenant.orders (x); CREATE INDEX CONCURRENTLY IF NOT EXISTS b ON tenant.orders (y);`,
      )[0],
    ).toContain('one CREATE INDEX CONCURRENTLY');
  });
});

describe('what a new migration may do', () => {
  it.each([
    [
      'a new table with its indexes, rules, defaults and rows',
      `CREATE TABLE IF NOT EXISTS "tenant"."things" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "code" text NOT NULL UNIQUE);${BREAK}CREATE INDEX IF NOT EXISTS "things_code_idx" ON "tenant"."things" USING btree ("code");${BREAK}ALTER TABLE "tenant"."things" ADD CONSTRAINT "things_fk" FOREIGN KEY ("id") REFERENCES "tenant"."orders"("id");${BREAK}INSERT INTO tenant.things (code) VALUES ('a');`,
    ],
    ['a nullable column', 'ALTER TABLE "tenant"."orders" ADD COLUMN "note" text;'],
    [
      'a required column with a fixed or stable default',
      "ALTER TABLE tenant.orders ADD COLUMN state text DEFAULT 'new' NOT NULL;\nALTER TABLE tenant.orders ADD COLUMN seen_at timestamptz DEFAULT now() NOT NULL;",
    ],
    [
      'rules added NOT VALID, a unique rule from a built index',
      'ALTER TABLE tenant.orders ADD CONSTRAINT c CHECK (total >= 0) NOT VALID;\nALTER TABLE tenant.orders ADD CONSTRAINT fk FOREIGN KEY (x) REFERENCES tenant.y(id) NOT VALID;\nALTER TABLE tenant.orders ADD CONSTRAINT k UNIQUE USING INDEX orders_k_idx;',
    ],
    ['validating a rule an earlier file added', 'ALTER TABLE tenant.orders VALIDATE CONSTRAINT c;'],
    [
      'loosening a rule',
      'ALTER TABLE "tenant"."orders" DROP CONSTRAINT "orders_kind_check";\nALTER TABLE tenant.orders ALTER COLUMN note DROP NOT NULL;\nALTER TABLE tenant.orders ALTER COLUMN note DROP DEFAULT;\nALTER TABLE tenant.orders RENAME CONSTRAINT a TO b;',
    ],
    ['a new enum value', "ALTER TYPE tenant.order_state ADD VALUE IF NOT EXISTS 'held';"],
    [
      "Lytro's own settings, added or changed with a reason",
      "-- reference-data: the new plan's suggested flag\nINSERT INTO control.plans (id) VALUES ('x');\nUPDATE control.plans SET suggested = true;",
    ],
    [
      'row-level security and grants',
      'ALTER TABLE tenant.orders ENABLE ROW LEVEL SECURITY;\nCREATE POLICY p ON tenant.orders USING (true);\nGRANT SELECT ON tenant.orders TO lytronix_app;',
    ],
  ])('%s', (_name, sql) => {
    expect(problemsOf(sql)).toEqual([]);
  });

  it('passes every migration from the first one checked', () => {
    const checked = readMigrationFiles().filter((each) => each.number >= 135);
    expect(checked.length).toBeGreaterThan(0);
    expect(checked.flatMap((each) => migrationProblems(each, null))).toEqual([]);
  });
});

describe('the order of migrations (orderProblems)', () => {
  const at = (tag: string, when: number): MigrationFile => migrationOf(tag, when, 'SELECT 1;');

  it('refuses a checked migration timed before one already in the journal, or numbered out of turn', () => {
    expect(orderProblems([at('0134_a', 300), at('0135_b', 200)], 135)).toEqual([
      '0135_b: its time (200) is not after every migration before it; regenerate it so it comes last',
    ]);
    expect(orderProblems([at('0134_a', 100), at('0136_b', 200)], 135)).toEqual([
      '0136_b: numbered 136 after 134',
    ]);
  });

  it('leaves the migrations before the first checked as they are', () => {
    expect(orderProblems([at('0133_a', 500), at('0134_b', 100), at('0135_c', 600)], 135)).toEqual(
      [],
    );
  });
});

/** git as a fake: the base commit's files, and what changed since. */
class FakeHistory implements MigrationHistory {
  constructor(
    private readonly files: Record<string, string>,
    private readonly changed: [string, string][] = [],
  ) {}

  baseOf(): string {
    return 'base';
  }

  show(_commit: string, path: string): string | null {
    return this.files[path] ?? null;
  }

  changedSince(): [string, string][] {
    return this.changed;
  }
}

describe('the CI check against the base (MigrationCheck)', () => {
  const merged = migrationOf('0135_merged', 100, 'SELECT 1;');
  const journal = JSON.stringify({ entries: [{ tag: '0135_merged', when: 100 }] });
  const snapshot = JSON.stringify({
    tables: {
      'tenant.orders': { name: 'orders', schema: 'tenant', columns: { id: {}, note: {} } },
    },
  });
  const base = {
    'drizzle/meta/_journal.json': journal,
    'drizzle/meta/0135_snapshot.json': snapshot,
  };

  it("checks only the new migrations, and a contract step's drops against the base's schema", () => {
    const dropsNote = migrationOf(
      '0136_drop',
      200,
      '-- contract-of: 0135_merged\nALTER TABLE tenant.orders DROP COLUMN note;',
    );
    const problems = new MigrationCheck(new FakeHistory(base), 'drizzle', [
      merged,
      dropsNote,
    ]).problems('origin/main');
    expect(problems).toEqual([
      "0136_drop drops tenant.orders.note, which the previous release's schema still has: stop reading and writing it, and take it out of the schema, a release first",
    ]);
  });

  it('refuses a merged migration changed or removed, and a merged journal entry moved', () => {
    const check = new MigrationCheck(
      new FakeHistory(base, [
        ['M', 'drizzle/0135_merged.sql'],
        ['A', 'drizzle/0136_new.sql'],
      ]),
      'drizzle',
      [migrationOf('0135_merged', 101, 'SELECT 1;'), migrationOf('0136_new', 200, 'SELECT 2;')],
    );
    expect(check.problems('origin/main')).toEqual([
      "the journal's entry for 0135_merged changed or moved: merged entries never change",
      '0135_merged was changed after it merged: a migration that ran never changes; put the change in a new one',
    ]);
  });
});

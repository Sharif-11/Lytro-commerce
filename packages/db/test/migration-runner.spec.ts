import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MigrationRunner, type MigrationRunnerSettings } from '../src/migrate';
import { ADMIN_URL } from './config';

// ENGINEERING-STANDARDS §5 (Phase 9 Slice 9.7): how the runner applies migrations to a real database. Each test has a
// database and a migrations folder of its own.
let admin: pg.Client;
const databases: string[] = [];
const folders: string[] = [];

beforeAll(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
});

afterAll(async () => {
  for (const name of databases) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

async function freshDatabase(name: string): Promise<string> {
  const database = `lytronix_runner_${name}`;
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${database}`);
  databases.push(database);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

/** A migrations folder as drizzle-kit writes one: a journal and a file per entry. */
function folderOf(entries: [tag: string, when: number, sql: string][]): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'lytro-migrations-'));
  folders.push(folder);
  mkdirSync(path.join(folder, 'meta'));
  writeFileSync(
    path.join(folder, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: entries.map(([tag, when], idx) => ({
        idx,
        version: '7',
        when,
        tag,
        breakpoints: true,
      })),
    }),
  );
  for (const [tag, , sql] of entries) writeFileSync(path.join(folder, `${tag}.sql`), sql);
  return folder;
}

async function onDatabase<T>(url: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

const exists = (url: string, name: string): Promise<boolean> =>
  onDatabase(url, async (client) => {
    const { rows } = await client.query<{ found: string | null }>(
      'SELECT to_regclass($1)::text AS found',
      [name],
    );
    return rows[0]?.found !== null && rows[0]?.found !== undefined;
  });

const recorded = (url: string): Promise<{ hash: string; created_at: string }[]> =>
  onDatabase(url, async (client) => {
    const { rows } = await client.query<{ hash: string; created_at: string }>(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id',
    );
    return rows;
  });

function runner(
  folder: string,
  overrides: Partial<MigrationRunnerSettings> = {},
): { run: MigrationRunner; lines: string[] } {
  const lines: string[] = [];
  const run = new MigrationRunner({
    folder,
    firstChecked: 1,
    lockTimeoutMs: 200,
    retryWaitsMs: [10, 10],
    log: (line) => {
      lines.push(line);
    },
    sleep: () => Promise.resolve(),
    ...overrides,
  });
  return { run, lines };
}

const CREATE_T = 'CREATE TABLE public.t (id int, code text);';

describe('the migration runner (ENGINEERING-STANDARDS §5)', () => {
  it('applies each pending migration once and records it where drizzle did, and a newer database is left alone', async () => {
    const url = await freshDatabase('applies');
    const sql = 'INSERT INTO public.t (id) VALUES (1);';
    const folder = folderOf([
      ['0001_a', 100, CREATE_T],
      ['0002_b', 200, sql],
    ]);
    const first = runner(folder);
    expect(await first.run.run(url)).toEqual(['0001_a', '0002_b']);
    expect(first.lines.filter((line) => line.startsWith('applied'))).toHaveLength(2);
    expect(await recorded(url)).toEqual([
      { hash: createHash('sha256').update(CREATE_T).digest('hex'), created_at: '100' },
      { hash: createHash('sha256').update(sql).digest('hex'), created_at: '200' },
    ]);

    const again = runner(folder);
    expect(await again.run.run(url)).toEqual([]);
    expect(again.lines).toEqual(['nothing to apply']);

    // The release before, after a rollback: its newest migration is older than the database's.
    const older = runner(folderOf([['0001_a', 100, CREATE_T]]));
    expect(await older.run.run(url)).toEqual([]);
    expect(older.lines).toEqual([
      'nothing to apply: this database has run migrations newer than this release (a rollback)',
    ]);
  });

  it('refuses a migration changed since it ran here, applying nothing; a Windows checkout of the same file is the same', async () => {
    const url = await freshDatabase('changed');
    await runner(folderOf([['0001_a', 100, CREATE_T]])).run.run(url);
    await expect(
      runner(folderOf([['0001_a', 100, CREATE_T.replace(/\n/g, '\r\n')]])).run.run(url),
    ).resolves.toEqual([]);
    const edited = folderOf([
      ['0001_a', 100, `${CREATE_T}\nCREATE INDEX t_id ON public.t (id);`],
      ['0002_b', 200, 'CREATE TABLE public.u (id int);'],
    ]);
    await expect(runner(edited).run.run(url)).rejects.toThrow(
      'changed since they ran on this database: 0001_a. A migration that ran never changes; put the change in a new one.',
    );
    expect(await exists(url, 'public.u')).toBe(false);
  });

  it('refuses migrations out of order before it touches the database', async () => {
    const url = await freshDatabase('order');
    const folder = folderOf([
      ['0001_a', 200, CREATE_T],
      ['0002_b', 100, 'CREATE TABLE public.u (id int);'],
    ]);
    await expect(runner(folder).run.run(url)).rejects.toThrow('the migrations are out of order');
    expect(await exists(url, 'drizzle.__drizzle_migrations')).toBe(false);
  });

  it('waits a short while for a lock another query holds, and tries again until it is free', async () => {
    const url = await freshDatabase('waits');
    await runner(folderOf([['0001_a', 100, CREATE_T]])).run.run(url);
    const holder = new pg.Client({ connectionString: url });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('LOCK TABLE public.t IN ACCESS EXCLUSIVE MODE');
      const folder = folderOf([
        ['0001_a', 100, CREATE_T],
        ['0002_b', 200, 'ALTER TABLE public.t ADD COLUMN note text;'],
      ]);
      // The slow query finishes during the runner's first pause.
      const { run, lines } = runner(folder, {
        sleep: () => holder.query('COMMIT').then(() => undefined),
      });
      expect(await run.run(url)).toEqual(['0002_b']);
      expect(lines[0]).toBe(
        '0002_b: a lock it needs is held by another query; trying again in 10 ms',
      );
    } finally {
      await holder.end();
    }
    const columns = await onDatabase(url, (client) =>
      client.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 't' AND column_name = 'note'",
      ),
    );
    expect(columns.rowCount).toBe(1);
  });

  it('gives up after its tries with none of that file applied, keeping the files before it', async () => {
    const url = await freshDatabase('gives_up');
    await runner(folderOf([['0001_a', 100, CREATE_T]])).run.run(url);
    const holder = new pg.Client({ connectionString: url });
    await holder.connect();
    let pauses = 0;
    try {
      await holder.query('BEGIN');
      await holder.query('LOCK TABLE public.t IN ACCESS EXCLUSIVE MODE');
      const folder = folderOf([
        ['0001_a', 100, CREATE_T],
        ['0002_b', 200, 'CREATE TABLE public.v (id int);'],
        [
          '0003_c',
          300,
          'CREATE TABLE public.u (id int);\n--> statement-breakpoint\nALTER TABLE public.t ADD COLUMN note text;',
        ],
      ]);
      const { run } = runner(folder, {
        sleep: () => {
          pauses += 1;
          return Promise.resolve();
        },
      });
      await expect(run.run(url)).rejects.toThrow(
        '0003_c failed: canceling statement due to lock timeout',
      );
    } finally {
      await holder.end();
    }
    expect(pauses).toBe(2);
    expect(await exists(url, 'public.v')).toBe(true);
    expect(await exists(url, 'public.u')).toBe(false);
    expect((await recorded(url)).map((row) => row.created_at)).toEqual(['100', '200']);
  });

  it('applies none of a file a statement fails in', async () => {
    const url = await freshDatabase('fails');
    const folder = folderOf([
      ['0001_a', 100, CREATE_T],
      ['0002_b', 200, 'CREATE TABLE public.u (id int);\n--> statement-breakpoint\nSELECT 1 / 0;'],
    ]);
    await expect(runner(folder).run.run(url)).rejects.toThrow('0002_b failed: division by zero');
    expect(await exists(url, 'public.t')).toBe(true);
    expect(await exists(url, 'public.u')).toBe(false);
  });

  it('builds an index outside a transaction, and builds again one a failed build left invalid', async () => {
    const url = await freshDatabase('concurrently');
    const folder = folderOf([
      ['0001_a', 100, `${CREATE_T}\nINSERT INTO public.t (code) VALUES ('a'), ('a');`],
      [
        '0002_b',
        200,
        '-- outside-transaction\nCREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS t_code_key ON public.t (code);',
      ],
    ]);
    await expect(runner(folder).run.run(url)).rejects.toThrow(
      '0002_b failed: could not create unique index',
    );
    const validity = (): Promise<boolean | undefined> =>
      onDatabase(url, async (client) => {
        const { rows } = await client.query<{ valid: boolean }>(
          "SELECT i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 't_code_key'",
        );
        return rows[0]?.valid;
      });
    expect(await validity()).toBe(false);

    await onDatabase(url, (client) =>
      client.query(
        "DELETE FROM public.t WHERE ctid = (SELECT max(ctid) FROM public.t WHERE code = 'a')",
      ),
    );
    const { run, lines } = runner(folder);
    expect(await run.run(url)).toEqual(['0002_b']);
    expect(lines[0]).toBe(
      '0002_b: public.t_code_key was left invalid by a failed build; dropping it to build again',
    );
    expect(await validity()).toBe(true);
  });
});

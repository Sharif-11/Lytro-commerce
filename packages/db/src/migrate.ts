import 'dotenv/config';
import pg from 'pg';
import { DatabaseConnector } from './client';
import {
  FIRST_CHECKED_MIGRATION,
  MIGRATIONS_FOLDER,
  orderProblems,
  readMigrationFiles,
  type MigrationFile,
} from './migration-files';
import { ReadRoleGrants } from './read-role';

export interface MigrationRunnerSettings {
  folder: string;
  /** The first migration whose order and unchanged text are held to. */
  firstChecked: number;
  /** How long a statement waits for a lock before it gives up, so it never queues every request behind it. */
  lockTimeoutMs: number;
  /** How long to wait before each new try after a lock wait ran out: one try per entry, then the run fails. */
  retryWaitsMs: readonly number[];
  log: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
}

const DEFAULT_SETTINGS: MigrationRunnerSettings = {
  folder: MIGRATIONS_FOLDER,
  firstChecked: FIRST_CHECKED_MIGRATION,
  lockTimeoutMs: 3_000,
  retryWaitsMs: [1_000, 2_000, 4_000, 8_000, 15_000],
  // Quiet unless asked: every e2e spec migrates its own database through prepareTestDatabase.
  log: () => undefined,
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

// drizzle's own table, kept so a release from before this runner reads the same history (a rollback past 9.7).
const TRACKING_TABLE = 'drizzle.__drizzle_migrations';
// Any fixed number: held for the whole run, so two runs never apply the same migration at once.
const RUN_LOCK = 917_135;
const LOCK_NOT_AVAILABLE = '55P03';
const INVALID_INDEX_CHECK = `
  SELECT i.indisvalid AS valid FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = $1 AND c.relname = $2`;
const CONCURRENT_INDEX =
  /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+(?:ONLY\s+)?"?(\w+)"?\./i;

const isLockTimeout = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === LOCK_NOT_AVAILABLE;

/**
 * Applies pending migrations (ENGINEERING-STANDARDS §5 and §7, Phase 9 Slice 9.7). Run as its own pipeline step before
 * the new code deploys. Each file runs in its own transaction, each statement waiting at most `lockTimeoutMs` for a
 * lock and the file tried again after a pause when one ran out, so a migration stuck behind a slow query gives up
 * rather than holding every request behind it. A file marked `-- outside-transaction` runs one statement at a time
 * (`CREATE INDEX CONCURRENTLY` can't run in a transaction), each tried again the same way, and an index a failed run
 * left invalid is dropped and built again. A migration checked by `firstChecked` must come after every one before it,
 * and must not have changed since it ran here.
 */
export class MigrationRunner {
  private readonly settings: MigrationRunnerSettings;

  constructor(
    settings: Partial<MigrationRunnerSettings> = {},
    private readonly readRole = new ReadRoleGrants(),
    private readonly connector = new DatabaseConnector(),
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  /** Applies what this database hasn't run yet, and returns the migrations applied. */
  async run(connectionString: string): Promise<string[]> {
    const files = readMigrationFiles(this.settings.folder);
    const order = orderProblems(files, this.settings.firstChecked);
    if (order.length > 0) {
      throw new Error(`the migrations are out of order:\n${order.join('\n')}`);
    }
    const client = new pg.Client({
      connectionString,
      application_name: 'lytronix-migrations',
      statement_timeout: 0,
    });
    client.on('error', (error) => {
      this.settings.log(`connection lost: ${error.message}`);
    });
    await client.connect();
    let applied: string[];
    try {
      await client.query('SELECT pg_advisory_lock($1)', [RUN_LOCK]);
      applied = await this.applyPending(client, files);
    } finally {
      // Ending the session lets the run's lock go too.
      await client.end();
    }
    // D9-13: the read pool's role reads whatever the application role may, the newest tables included.
    const handle = this.connector.connect(connectionString, {
      max: 1,
      statementTimeoutMillis: 0,
      applicationName: 'lytronix-migrations',
    });
    try {
      await this.readRole.sync(handle.db);
    } finally {
      await handle.close();
    }
    return applied;
  }

  private async applyPending(
    client: pg.Client,
    files: readonly MigrationFile[],
  ): Promise<string[]> {
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    );
    const { rows } = await client.query<{ hash: string; created_at: string }>(
      `SELECT hash, created_at FROM ${TRACKING_TABLE}`,
    );
    const recorded = new Map(rows.map((row) => [Number(row.created_at), row.hash]));
    const changed = files.filter((file) => {
      const hash = recorded.get(file.when);
      return (
        file.number >= this.settings.firstChecked &&
        hash !== undefined &&
        !file.recordedAs.includes(hash)
      );
    });
    if (changed.length > 0) {
      throw new Error(
        `changed since they ran on this database: ${changed.map((file) => file.tag).join(', ')}. A migration that ran never changes; put the change in a new one.`,
      );
    }
    // As drizzle chose: everything later than the newest migration this database ran.
    const newest = Math.max(0, ...recorded.keys());
    const pending = files.filter((file) => file.when > newest);
    if (pending.length === 0) {
      const latest = files.at(-1);
      this.settings.log(
        latest && newest > latest.when
          ? 'nothing to apply: this database has run migrations newer than this release (a rollback)'
          : 'nothing to apply',
      );
      return [];
    }
    for (const file of pending) {
      const started = Date.now();
      if (file.outsideTransaction) await this.applyOutsideTransaction(client, file);
      else await this.applyInTransaction(client, file);
      this.settings.log(`applied ${file.tag} in ${String(Date.now() - started)} ms`);
    }
    return pending.map((file) => file.tag);
  }

  private async applyInTransaction(client: pg.Client, file: MigrationFile): Promise<void> {
    await this.withRetries(file.tag, async () => {
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL lock_timeout = ${String(this.settings.lockTimeoutMs)}`);
        for (const statement of file.statements) await client.query(statement);
        await this.record(client, file);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async applyOutsideTransaction(client: pg.Client, file: MigrationFile): Promise<void> {
    await client.query(`SET lock_timeout = ${String(this.settings.lockTimeoutMs)}`);
    try {
      for (const statement of file.statements) {
        await this.withRetries(file.tag, async () => {
          await this.dropInvalidIndex(client, file.tag, statement);
          await client.query(statement);
        });
      }
      await this.record(client, file);
    } finally {
      await client.query('RESET lock_timeout');
    }
  }

  /** An index a failed concurrent build left behind is invalid, and `IF NOT EXISTS` would keep it: dropped first. */
  private async dropInvalidIndex(client: pg.Client, tag: string, statement: string): Promise<void> {
    const match = CONCURRENT_INDEX.exec(statement);
    if (!match) return;
    const [, index = '', schema = ''] = match;
    const { rows } = await client.query<{ valid: boolean }>(INVALID_INDEX_CHECK, [schema, index]);
    if (rows[0]?.valid === false) {
      this.settings.log(
        `${tag}: ${schema}.${index} was left invalid by a failed build; dropping it to build again`,
      );
      await client.query(`DROP INDEX CONCURRENTLY IF EXISTS "${schema}"."${index}"`);
    }
  }

  private async record(client: pg.Client, file: MigrationFile): Promise<void> {
    await client.query(`INSERT INTO ${TRACKING_TABLE} (hash, created_at) VALUES ($1, $2)`, [
      file.hash,
      file.when,
    ]);
  }

  private async withRetries(tag: string, attempt: () => Promise<void>): Promise<void> {
    for (let tries = 0; ; tries += 1) {
      try {
        await attempt();
        return;
      } catch (error) {
        const wait = this.settings.retryWaitsMs[tries];
        if (!isLockTimeout(error) || wait === undefined) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`${tag} failed: ${message}`, { cause: error });
        }
        this.settings.log(
          `${tag}: a lock it needs is held by another query; trying again in ${String(wait)} ms`,
        );
        await this.settings.sleep(wait);
      }
    }
  }
}

if (require.main === module) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  new MigrationRunner({
    log: (line) => {
      console.log(line);
    },
  })
    .run(url)
    .then(
      () => {
        console.log('migrations applied');
      },
      (error: unknown) => {
        console.error(error);
        process.exit(1);
      },
    );
}

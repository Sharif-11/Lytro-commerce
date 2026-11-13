import 'dotenv/config';
import pg from 'pg';
import { QueueBootstrapper } from './bootstrap-queue';
import { MigrationRunner } from './migrate';
import { READ_ROLE } from './read-role';

/** The application's own role (D25): it logs in, and is never a superuser nor past row-level security. */
const TEST_APP_ROLE = 'lytronix_app';
/** Its password on a test or local database only; a deployment sets its own. */
const TEST_APP_PASSWORD = 'lytronix_app_local_only';
/** The read pool's role (D9-13): SELECT only, read-only by default; its grants follow the application role's. */
const TEST_READ_PASSWORD = 'lytronix_read_local_only';
/** The advisory lock the suites take turns by while they make or change the shared roles; any fixed number. */
const TEST_ROLES_LOCK = 7_310_913;

/** A connection URL pointed at another database, and as another user when given one. */
function withDatabase(url: string, database: string, user?: string, password?: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user) parsed.username = user;
  if (password) parsed.password = password;
  return parsed.toString();
}

/**
 * A prepared database's addresses: the admin's, which bypasses row-level security, the application's, and the read
 * pool's (D9-13).
 */
export interface PreparedDatabase {
  adminDbUrl: string;
  appDbUrl: string;
  readDbUrl: string;
}

/**
 * A fresh database for a test run, named by the run so runs side by side never drop each other's data: the
 * application role made if missing, the database dropped and made again, every migration applied, and pg-boss's
 * schema installed by the admin credential, as production's pipeline does (D25). The server's tests and the
 * dashboard's real-server walkthrough both start from one.
 */
export class TestDatabasePreparer {
  async prepare(adminUrl: string, database: string): Promise<PreparedDatabase> {
    const maintenance = new pg.Client({ connectionString: adminUrl });
    await maintenance.connect();
    try {
      await this.ensureRoles(maintenance);
      await maintenance.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
      await maintenance.query(`CREATE DATABASE ${database}`);
    } finally {
      await maintenance.end();
    }

    const adminDbUrl = withDatabase(adminUrl, database);
    await new MigrationRunner().run(adminDbUrl);
    await new QueueBootstrapper().run(adminDbUrl);
    return {
      adminDbUrl,
      appDbUrl: withDatabase(adminUrl, database, TEST_APP_ROLE, TEST_APP_PASSWORD),
      readDbUrl: withDatabase(adminUrl, database, READ_ROLE, TEST_READ_PASSWORD),
    };
  }

  /**
   * The application's and the read pool's roles, made if missing, and the read pool's kept read-only. Suites start side
   * by side and the roles are the cluster's, shared by all: two suites changing one role at once collide in Postgres's
   * catalog ("tuple concurrently updated", which failed a deploy's verify on 2026-11-13). So one suite at a time, by a
   * lock every suite's admin connection to the maintenance database shares, held until this step commits.
   */
  async ensureRoles(maintenance: pg.Client): Promise<void> {
    await maintenance.query('BEGIN');
    try {
      await maintenance.query('SELECT pg_advisory_xact_lock($1)', [TEST_ROLES_LOCK]);
      await maintenance.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TEST_APP_ROLE}') THEN
            CREATE ROLE ${TEST_APP_ROLE} LOGIN PASSWORD '${TEST_APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${READ_ROLE}') THEN
            CREATE ROLE ${READ_ROLE} LOGIN PASSWORD '${TEST_READ_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
          END IF;
          ALTER ROLE ${READ_ROLE} SET default_transaction_read_only = on;
        -- A process outside the lock (an older checkout's tests) can still make a role between the look and the make.
        EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
        END $$`);
      await maintenance.query('COMMIT');
    } catch (error) {
      await maintenance.query('ROLLBACK');
      throw error;
    }
  }
}

if (require.main === module) {
  // `node dist/prepare-database.js <name>`, for a harness outside this package: prepares the database from
  // DATABASE_TEST_ADMIN_URL and prints only the application's address, as JSON.
  const adminUrl = process.env['DATABASE_TEST_ADMIN_URL'];
  const name = process.argv[2];
  if (!adminUrl || !name || !/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(
      'DATABASE_TEST_ADMIN_URL and a database name (lower case, digits, _) are required',
    );
  }
  new TestDatabasePreparer().prepare(adminUrl, name).then(
    ({ appDbUrl }) => {
      console.log(JSON.stringify({ appDbUrl }));
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}

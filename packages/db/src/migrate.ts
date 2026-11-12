import 'dotenv/config';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { DatabaseConnector } from './client';
import { ReadRoleGrants } from './read-role';

// Resolved relative to this file, so it works from both src/ (tests) and dist/ (built output).
const MIGRATIONS_FOLDER = path.resolve(__dirname, '..', 'drizzle');

/** Applies pending migrations. Run as its own pipeline step before the new code deploys (ENGINEERING-STANDARDS §7). */
export class MigrationRunner {
  constructor(private readonly readRole = new ReadRoleGrants()) {}

  async run(connectionString: string): Promise<void> {
    const handle = new DatabaseConnector().connect(connectionString, {
      max: 1,
      statementTimeoutMillis: 0,
      applicationName: 'lytronix-migrations',
    });
    try {
      await migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
      // D9-13: the read pool's role reads whatever the application role may, the newest tables included.
      await this.readRole.sync(handle.db);
    } finally {
      await handle.close();
    }
  }
}

if (require.main === module) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  new MigrationRunner().run(url).then(
    () => {
      console.log('migrations applied');
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}

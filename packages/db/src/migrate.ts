import 'dotenv/config';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client';

// Resolved relative to this file, so it works from both src/ (tests) and dist/ (built output).
const MIGRATIONS_FOLDER = path.resolve(__dirname, '..', 'drizzle');

/** Applies pending migrations. Run as its own pipeline step before the new code deploys (ENGINEERING-STANDARDS §7). */
export async function runMigrations(connectionString: string): Promise<void> {
  const handle = createDatabase(connectionString);
  try {
    await migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await handle.close();
  }
}

if (require.main === module) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  runMigrations(url).then(
    () => {
      console.log('migrations applied');
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}

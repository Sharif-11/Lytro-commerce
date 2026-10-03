import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client';

/** Applies pending migrations from ./drizzle. Run as its own pipeline step before the new code deploys (ENGINEERING-STANDARDS §7). */
export async function runMigrations(connectionString: string): Promise<void> {
  const handle = createDatabase(connectionString);
  try {
    await migrate(handle.db, { migrationsFolder: './drizzle' });
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

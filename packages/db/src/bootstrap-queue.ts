import 'dotenv/config';
import { PgBoss } from 'pg-boss';

/**
 * Installs or upgrades pg-boss's own schema (D25). Runs as its own privileged pipeline step, the same way
 * migrations do (ENGINEERING-STANDARDS §7): `CREATE SCHEMA` needs database-level CREATE, checked before Postgres
 * even looks at whether the schema exists, so the app's own restricted role can never do this — only the
 * schema-owner credential migrations already use. Run this before the app starts, and again whenever pg-boss
 * itself is upgraded to a version with its own internal migrations.
 */
export class QueueBootstrapper {
  async run(connectionString: string): Promise<void> {
    const boss = new PgBoss({ connectionString, schema: 'pgboss', max: 1 });
    try {
      await boss.start();
    } finally {
      await boss.stop();
    }
  }
}

if (require.main === module) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required to bootstrap the queue schema');
  }
  new QueueBootstrapper().run(url).then(
    () => {
      console.log('queue schema installed');
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}

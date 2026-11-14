import 'dotenv/config';
import pg from 'pg';
import { EnvironmentParser } from './config/env';
import { SecretBox } from './modules/shared/secrets/secret-box';
import { SealedValuesReseal } from './modules/shared/secrets/sealed-values';
import { keysOf } from './modules/shared/secrets/secrets.module';

/**
 * SEC-10, §81, D9-8 (Phase 9 Slice 9.7): seals every stored value again with the current key, after the key changed and
 * while the one before is still set beside it (RUNBOOKS.md §3). On a server, through the worker's own start, which reads
 * the key file:
 *
 *   docker compose run --rm --no-deps worker node dist/reseal.js
 *
 * Exits 3 when some value neither key opens (each listed by its column and owner), 0 otherwise. Never runs without
 * DATA_ENCRYPTION_KEY: the made-up key a process uses without one would seal everything with a key gone at exit.
 */
class ResealCommand {
  async run(): Promise<number> {
    const env = new EnvironmentParser().parse();
    if (!env.DATA_ENCRYPTION_KEY) {
      process.stderr.write('DATA_ENCRYPTION_KEY is not set: nothing was sealed again\n');
      return 1;
    }
    const db = new pg.Client({
      connectionString: env.DATABASE_URL,
      application_name: 'lytronix-reseal',
    });
    await db.connect();
    try {
      const counts = await new SealedValuesReseal(db, new SecretBox(keysOf(env))).run();
      for (const count of counts) {
        const unreadable =
          count.unreadable.length > 0
            ? `, ${String(count.unreadable.length)} unreadable (${count.unreadable.join(', ')})`
            : '';
        process.stdout.write(
          `${count.column}: ${String(count.resealed)} sealed again, ${String(count.current)} already current${unreadable}\n`,
        );
      }
      return counts.some((count) => count.unreadable.length > 0) ? 3 : 0;
    } finally {
      await db.end();
    }
  }
}

new ResealCommand().run().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  },
);

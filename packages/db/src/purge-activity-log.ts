import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { DatabaseConnector } from './client';

/**
 * Deletes activity log entries past each shop's plan retention (AUD-06). Runs as its own privileged pipeline step,
 * the same way migrations do (ENGINEERING-STANDARDS §7): never from the live app, which never holds a credential
 * that can delete from this table. The table's insert-only trigger (migration 0001, AUD-03, DAT-10) rejects
 * UPDATE and DELETE from every role unconditionally, so even this connection must turn it off for the moment of
 * the delete, inside one transaction, and turn it back on before committing.
 */
export class ActivityLogPurger {
  async run(connectionString: string): Promise<{ purged: number }> {
    const handle = new DatabaseConnector().connect(connectionString, {
      max: 1,
      statementTimeoutMillis: 0,
      applicationName: 'lytronix-purge',
    });
    try {
      const result = await handle.db.transaction(async (tx) => {
        await tx.execute(
          sql`ALTER TABLE tenant.activity_log DISABLE TRIGGER activity_log_insert_only`,
        );
        try {
          return await tx.execute(sql`
            DELETE FROM tenant.activity_log al
            USING control.tenants t
            LEFT JOIN control.plans p ON p.id = t.plan_id
            WHERE al.tenant_id = t.id
              AND al.created_at < now() - (
                COALESCE((p.limits ->> 'activity_retention_days')::int, 30) || ' days'
              )::interval
          `);
        } finally {
          await tx.execute(
            sql`ALTER TABLE tenant.activity_log ENABLE TRIGGER activity_log_insert_only`,
          );
        }
      });
      return { purged: result.rowCount ?? 0 };
    } finally {
      await handle.close();
    }
  }
}

if (require.main === module) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required to purge the activity log');
  }
  new ActivityLogPurger().run(url).then(
    ({ purged }) => {
      console.log(`activity log purged: ${String(purged)} rows`);
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}

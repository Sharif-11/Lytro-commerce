import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { MONEY_RELATED_AUDIT_ACTIONS } from '@lytronix/validators';
import { DatabaseConnector } from './client';

// AUD-07: a money-related entry is kept this long regardless of the plan's own retention setting.
const MONEY_RETENTION_MONTHS = 24;

/**
 * Deletes activity log entries past each shop's plan retention (AUD-06), except a money-related entry
 * (payment, wallet, credential, plan, balance -- AUD-07's own four categories, as `MONEY_RELATED_AUDIT_ACTIONS`),
 * which is kept for 24 months regardless of plan. DWN-11: a downgrade that shortens retention doesn't lower
 * the floor used here until `tenants.retention_floor_until` (set by `DowngradeService.apply`, 14 days after
 * the owner was notified) has passed -- until then the greater of the floor and the current plan's own
 * retention applies. Runs as its own privileged pipeline step, the same way
 * migrations do (ENGINEERING-STANDARDS §7): never from the live app, which never holds a credential that can
 * delete from this table. The table's insert-only trigger (migration 0001, AUD-03, DAT-10) rejects UPDATE and
 * DELETE from every role unconditionally, so even this connection must turn it off for the moment of the
 * delete, inside one transaction, and turn it back on before committing.
 */
export class ActivityLogPurger {
  async run(connectionString: string): Promise<{ purged: number }> {
    const handle = new DatabaseConnector().connect(connectionString, {
      max: 1,
      statementTimeoutMillis: 0,
      applicationName: 'lytronix-purge',
    });
    try {
      const moneyActions = sql.join(
        [...MONEY_RELATED_AUDIT_ACTIONS].map((action) => sql`${action}`),
        sql`, `,
      );
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
                COALESCE(
                  CASE
                    WHEN t.retention_floor_until IS NOT NULL AND now() < t.retention_floor_until
                      THEN GREATEST(t.retention_floor_days, (p.limits ->> 'activity_retention_days')::int)
                    ELSE (p.limits ->> 'activity_retention_days')::int
                  END,
                  30
                ) || ' days'
              )::interval
              AND (
                al.action NOT IN (${moneyActions})
                OR al.created_at < now() - interval '${sql.raw(String(MONEY_RETENTION_MONTHS))} months'
              )
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

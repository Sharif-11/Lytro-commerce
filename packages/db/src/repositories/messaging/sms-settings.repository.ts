import { eq, sql } from 'drizzle-orm';
import type { SmsEvent } from '@lytronix/validators';
import { smsSettings, type SelectSmsSettings } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** One change to a shop's SMS settings; a part left out stays as it is. */
export interface SmsSettingsChange {
  events?: Partial<Record<SmsEvent, boolean>>;
  templates?: Partial<Record<SmsEvent, string>>;
  /** SMS-19: templates going back to the platform's default. */
  resetTemplates?: readonly SmsEvent[];
  smsName?: string | null;
  monthlySpendCap?: string | null;
}

// SMS-02, SMS-10, SMS-13, SMS-16, SMS-19 (Slice 7.2): a shop's SMS settings.
export class SmsSettingsRepository {
  constructor(private readonly transactions: Pick<TransactionRunner, 'setTenantContext'>) {}

  /** LIF-19: a deleted shop's SMS settings; the trigger lets this through only for an archived or deleted shop. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(smsSettings).where(eq(smsSettings.tenantId, tenantId));
  }

  async find(tx: Transaction, tenantId: string): Promise<SelectSmsSettings | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx.select().from(smsSettings).where(eq(smsSettings.tenantId, tenantId));
    return row ?? null;
  }

  /**
   * Merges the change into the shop's row, making it the first time: switches and templates are merged key by key,
   * so two owners changing different events never undo each other, and a reset takes its template out.
   */
  async change(
    tx: Transaction,
    tenantId: string,
    change: SmsSettingsChange,
  ): Promise<SelectSmsSettings> {
    await this.transactions.setTenantContext(tx, tenantId);
    const events = change.events ?? {};
    const templates = change.templates ?? {};
    const reset = [...(change.resetTemplates ?? [])];
    const [row] = await tx
      .insert(smsSettings)
      .values({
        tenantId,
        events,
        templates: Object.fromEntries(
          Object.entries(templates).filter(
            ([event]) => !(reset as readonly string[]).includes(event),
          ),
        ),
        smsName: change.smsName ?? null,
        monthlySpendCap: change.monthlySpendCap ?? null,
      })
      .onConflictDoUpdate({
        target: smsSettings.tenantId,
        set: {
          events: sql`${smsSettings.events} || ${JSON.stringify(events)}::jsonb`,
          // A list in sql`` is spread as separate values, so the array is written out in full.
          templates: sql`(${smsSettings.templates} || ${JSON.stringify(templates)}::jsonb) - ARRAY[${sql.join(
            reset.map((event) => sql`${event}`),
            sql`, `,
          )}]::text[]`,
          smsName:
            change.smsName === undefined ? sql`${smsSettings.smsName}` : (change.smsName ?? null),
          monthlySpendCap:
            change.monthlySpendCap === undefined
              ? sql`${smsSettings.monthlySpendCap}`
              : (change.monthlySpendCap ?? null),
          updatedAt: sql`now()`,
        },
      })
      .returning();
    if (!row) throw new Error('upsert returned no SMS settings row');
    return row;
  }
}

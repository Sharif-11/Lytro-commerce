import { eq } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { platformSettings, type SelectPlatformSetting } from '../../schema';

// LIF-26: every platform-wide editable value that isn't a per-use rate (RatesRepository). control.platform_settings
// is control-schema (platform-wide), so this needs no transaction or tenant context.
export class PlatformSettingsRepository {
  async get(db: Executor, key: string): Promise<SelectPlatformSetting | null> {
    const rows = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, key))
      .limit(1);
    return rows[0] ?? null;
  }

  async list(db: Executor): Promise<SelectPlatformSetting[]> {
    return db.select().from(platformSettings);
  }

  /** Inserts the key if it has never been set, used only by a seed migration. */
  async seed(db: Executor, key: string, value: unknown, description: string): Promise<void> {
    await db.insert(platformSettings).values({ key, value, description }).onConflictDoNothing();
  }

  /** Writes the new value and who changed it, in one upsert. */
  async set(
    db: Executor,
    key: string,
    value: unknown,
    description: string,
    updatedBy: string,
  ): Promise<void> {
    await db
      .insert(platformSettings)
      .values({ key, value, description, updatedBy })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value, description, updatedBy, updatedAt: new Date() },
      });
  }
}

import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { businessTypePresets, type SelectBusinessTypePreset } from '../../schema';

// PST-01, PST-02, PST-04: the platform's shop-type presets. Platform data, read by every shop; no tenant context.
export class PresetRepository {
  async listPresets(db: Executor): Promise<SelectBusinessTypePreset[]> {
    return db.select().from(businessTypePresets).orderBy(asc(businessTypePresets.sortOrder));
  }

  async findPreset(db: Executor, key: string): Promise<SelectBusinessTypePreset | null> {
    const rows = await db
      .select()
      .from(businessTypePresets)
      .where(eq(businessTypePresets.key, key));
    return rows[0] ?? null;
  }
}

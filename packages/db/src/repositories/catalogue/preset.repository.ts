import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { isEmptyPatch } from '../patch';
import { businessTypePresets, type SelectBusinessTypePreset } from '../../schema';

/** PST-04: what the operator may change on a preset. Its key is how shops refer to it, so it never changes. */
export type PresetPatch = Partial<Omit<SelectBusinessTypePreset, 'key' | 'sortOrder'>>;

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

  async updatePreset(
    db: Executor,
    key: string,
    patch: PresetPatch,
  ): Promise<SelectBusinessTypePreset | null> {
    if (isEmptyPatch(patch)) return this.findPreset(db, key);
    const rows = await db
      .update(businessTypePresets)
      .set(patch)
      .where(eq(businessTypePresets.key, key))
      .returning();
    return rows[0] ?? null;
  }
}

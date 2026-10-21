import { asc, eq, isNull } from 'drizzle-orm';
import type { AddonKind } from '@lytronix/validators';
import { addons, type SelectAddon } from '../../schema';
import type { Executor } from '../../transactions';

export type AddonRow = SelectAddon;

export interface NewAddonValues {
  key: string;
  kind: AddonKind;
  limitKey: string | null;
  unitSize: number | null;
  price: string;
  labelEn: string;
  labelBn: string;
}

export type AddonEdit = Partial<Pick<NewAddonValues, 'price' | 'unitSize' | 'labelEn' | 'labelBn'>>;

// PLN-13: the add-on catalogue.
export class AddonRepository {
  /** Every item in the order added; a retired one only when asked. */
  async list(db: Executor, includeRetired: boolean): Promise<AddonRow[]> {
    return db
      .select()
      .from(addons)
      .where(includeRetired ? undefined : isNull(addons.retiredAt))
      .orderBy(asc(addons.createdAt), asc(addons.key));
  }

  async findById(db: Executor, id: string): Promise<AddonRow | null> {
    const rows = await db.select().from(addons).where(eq(addons.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async insert(db: Executor, values: NewAddonValues): Promise<AddonRow> {
    const [row] = await db.insert(addons).values(values).returning();
    if (!row) throw new Error('insert returned no add-on');
    return row;
  }

  async update(db: Executor, id: string, edit: AddonEdit): Promise<AddonRow | null> {
    const [row] = await db.update(addons).set(edit).where(eq(addons.id, id)).returning();
    return row ?? null;
  }

  /** PLN-13: no longer for sale; what was bought runs to its end. */
  async retire(db: Executor, id: string, at: Date): Promise<AddonRow | null> {
    const [row] = await db
      .update(addons)
      .set({ retiredAt: at })
      .where(eq(addons.id, id))
      .returning();
    return row ?? null;
  }
}

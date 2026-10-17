import { asc, eq } from 'drizzle-orm';
import { platformWallets, type SelectPlatformWallet } from '../../schema';
import type { Executor } from '../../transactions';

export interface NewPlatformWallet {
  provider: string;
  number: string;
  label: string | null;
  enabled: boolean;
  displayOrder: number;
}

export type UpdatePlatformWallet = Partial<NewPlatformWallet>;

// BIL-02/BAL-03: the platform's own wallet numbers. Not RLS-protected -- platform-wide, control-schema data.
export class PlatformWalletsRepository {
  async insert(db: Executor, values: NewPlatformWallet): Promise<SelectPlatformWallet> {
    const [row] = await db.insert(platformWallets).values(values).returning();
    if (!row) throw new Error('insert returned no platform wallet');
    return row;
  }

  async update(
    db: Executor,
    id: string,
    values: UpdatePlatformWallet,
  ): Promise<SelectPlatformWallet | null> {
    const [row] = await db
      .update(platformWallets)
      .set(values)
      .where(eq(platformWallets.id, id))
      .returning();
    return row ?? null;
  }

  async remove(db: Executor, id: string): Promise<void> {
    await db.delete(platformWallets).where(eq(platformWallets.id, id));
  }

  /** `enabledOnly`: the tenant-facing read passes `true`; the operator's own management screen passes
      `false` so it can see (and re-enable) a disabled wallet too. */
  async list(db: Executor, enabledOnly: boolean): Promise<SelectPlatformWallet[]> {
    const query = db.select().from(platformWallets).orderBy(asc(platformWallets.displayOrder));
    if (!enabledOnly) return query;
    return db
      .select()
      .from(platformWallets)
      .where(eq(platformWallets.enabled, true))
      .orderBy(asc(platformWallets.displayOrder));
  }
}

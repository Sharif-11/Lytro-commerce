import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { ListenerRevokeReason, TenantState } from '@lytronix/validators';
import {
  listenerBlockedInstallations,
  listenerDevices,
  listenerPairingCodes,
  listenerUnreadShapes,
  tenants,
  type SelectListenerDevice,
  type SelectListenerPairingCode,
  type SelectListenerUnreadShape,
} from '../../schema';
import type { Executor } from '../../transactions';

/** LSN-01, LSN-11: a device as it is paired -- its token's hash, bound to the shop and the app installation. */
export interface NewListenerDevice {
  /** Slice 5.6: null for Lytro's own phone. */
  tenantId: string | null;
  name: string;
  model: string | null;
  appVersion: string;
  installationId: string;
  tokenHash: string;
  pairedBy: string | null;
}

/** LSN-07: what decides whether a shop may use the listener now, and its name for the app. */
export interface ListenerShopRow {
  state: TenantState;
  suspendedAt: Date | null;
  shopName: string;
}

// LSN-01 to LSN-23 (Phase 5 Slice 5.4a): the listener's pairing codes, paired phones and Lytro's blocked app
// installations, in control -- the app is found by its code or token before its shop is known, as API keys are.
export class ListenerRepository {
  /** VER-07 (Slice 5.4b): whether any of the shop's phones reported since `since`. */
  async anySeenSince(db: Executor, tenantId: string, since: Date): Promise<boolean> {
    const [row] = await db
      .select({ id: listenerDevices.id })
      .from(listenerDevices)
      .where(
        and(
          eq(listenerDevices.tenantId, tenantId),
          isNull(listenerDevices.revokedAt),
          gte(listenerDevices.lastSeenAt, since),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /** LSN-03, LSN-20 (Slice 5.4b): messages taken from a phone -- it is seen now, on this version, and they count today. */
  async noteUploads(
    db: Executor,
    id: string,
    values: { at: Date; appVersion: string; day: string; count: number },
  ): Promise<void> {
    await db
      .update(listenerDevices)
      .set({
        lastSeenAt: values.at,
        appVersion: values.appVersion,
        uploadsToday: sql`CASE WHEN ${listenerDevices.uploadsDay} = ${values.day}
          THEN ${listenerDevices.uploadsToday} + ${values.count} ELSE ${values.count} END`,
        uploadsDay: values.day,
      })
      .where(eq(listenerDevices.id, id));
  }

  /** LSN-04 (Slice 5.4b): test mode on until `until`. */
  async startTestMode(db: Executor, id: string, until: Date): Promise<void> {
    await db
      .update(listenerDevices)
      .set({ testModeUntil: until })
      .where(eq(listenerDevices.id, id));
  }

  /** LSN-14 (Slice 5.4b): the phone flagged for its volume now, unless it was since `since`; whether this flagged it. */
  async flagVolume(db: Executor, id: string, at: Date, since: Date): Promise<boolean> {
    const rows = await db
      .update(listenerDevices)
      .set({ volumeFlaggedAt: at })
      .where(
        and(
          eq(listenerDevices.id, id),
          or(isNull(listenerDevices.volumeFlaggedAt), lt(listenerDevices.volumeFlaggedAt, since)),
        ),
      )
      .returning({ id: listenerDevices.id });
    return rows.length > 0;
  }

  /** VER-06 (amended 2026-11-02): one more unreadable message of this shape today; the day's count of all of them. */
  async addUnread(
    db: Executor,
    values: { day: string; shapeHash: string; shape: string },
  ): Promise<number> {
    await db
      .insert(listenerUnreadShapes)
      .values({ ...values, count: 1 })
      .onConflictDoUpdate({
        target: [listenerUnreadShapes.day, listenerUnreadShapes.shapeHash],
        set: { count: sql`${listenerUnreadShapes.count} + 1` },
      });
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${listenerUnreadShapes.count}), 0)::int` })
      .from(listenerUnreadShapes)
      .where(eq(listenerUnreadShapes.day, values.day));
    return row?.total ?? 0;
  }

  /** VER-06: the shapes since `day`, the newest day and the commonest first. */
  async listUnread(db: Executor, day: string): Promise<SelectListenerUnreadShape[]> {
    return db
      .select()
      .from(listenerUnreadShapes)
      .where(gte(listenerUnreadShapes.day, day))
      .orderBy(desc(listenerUnreadShapes.day), desc(listenerUnreadShapes.count));
  }

  async purgeUnread(db: Executor, day: string): Promise<number> {
    const rows = await db
      .delete(listenerUnreadShapes)
      .where(lt(listenerUnreadShapes.day, day))
      .returning({ day: listenerUnreadShapes.day });
    return rows.length;
  }

  async insertCode(
    db: Executor,
    values: {
      tenantId: string | null;
      codeHash: string;
      createdBy: string | null;
      expiresAt: Date;
    },
  ): Promise<SelectListenerPairingCode> {
    const [row] = await db.insert(listenerPairingCodes).values(values).returning();
    if (!row) throw new Error('insert returned no pairing code');
    return row;
  }

  /** LSN-09: a code by its hash, held for the pairing; null for none. */
  async lockCode(db: Executor, codeHash: string): Promise<SelectListenerPairingCode | null> {
    const [row] = await db
      .select()
      .from(listenerPairingCodes)
      .where(eq(listenerPairingCodes.codeHash, codeHash))
      .for('update');
    return row ?? null;
  }

  async spendCode(db: Executor, id: string, at: Date): Promise<void> {
    await db
      .update(listenerPairingCodes)
      .set({ usedAt: at })
      .where(eq(listenerPairingCodes.id, id));
  }

  /** LSN-10: one more wrong try on a code, voided at the last one allowed; the tries now. */
  async addTry(db: Executor, id: string, max: number, at: Date): Promise<number> {
    const [row] = await db
      .update(listenerPairingCodes)
      .set({
        tries: sql`${listenerPairingCodes.tries} + 1`,
        voidedAt: sql`CASE WHEN ${listenerPairingCodes.tries} + 1 >= ${max} THEN ${at.toISOString()}::timestamptz ELSE ${listenerPairingCodes.voidedAt} END`,
      })
      .where(eq(listenerPairingCodes.id, id))
      .returning({ tries: listenerPairingCodes.tries });
    return row?.tries ?? 0;
  }

  /** LSN-08: the shop's paired phones still working. */
  /**
   * LSN-08: the shop's phones still working, counted under a lock held to the end of the caller's transaction, so two
   * pairings at once count one after the other and can't both pass the plan's limit (found at the Phase 5 close-out).
   */
  async countLive(db: Executor, tenantId: string): Promise<number> {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`listener_pairing:${tenantId}`}, 0))`,
    );
    const [row] = await db
      .select({ total: count() })
      .from(listenerDevices)
      .where(and(eq(listenerDevices.tenantId, tenantId), isNull(listenerDevices.revokedAt)));
    return row?.total ?? 0;
  }

  async insertDevice(db: Executor, values: NewListenerDevice): Promise<SelectListenerDevice> {
    const [row] = await db.insert(listenerDevices).values(values).returning();
    if (!row) throw new Error('insert returned no listener device');
    return row;
  }

  /** LSN-11: the device a token belongs to; null for none. */
  async findByTokenHash(db: Executor, tokenHash: string): Promise<SelectListenerDevice | null> {
    const [row] = await db
      .select()
      .from(listenerDevices)
      .where(eq(listenerDevices.tokenHash, tokenHash));
    return row ?? null;
  }

  /** LSN-20: the shop's phones, the oldest paired first. */
  /** PAY-21 (Slice 5.6): Lytro's own phones, newest first. */
  async listForLytro(db: Executor): Promise<SelectListenerDevice[]> {
    return db
      .select()
      .from(listenerDevices)
      .where(isNull(listenerDevices.tenantId))
      .orderBy(desc(listenerDevices.pairedAt));
  }

  async listForTenant(db: Executor, tenantId: string): Promise<SelectListenerDevice[]> {
    return db
      .select()
      .from(listenerDevices)
      .where(eq(listenerDevices.tenantId, tenantId))
      .orderBy(asc(listenerDevices.pairedAt), asc(listenerDevices.id));
  }

  /** One of the shop's phones -- or, with no shop, any (the operator's) -- held when `lock`; null for none. */
  async findDevice(
    db: Executor,
    tenantId: string | null,
    id: string,
    lock: boolean,
  ): Promise<SelectListenerDevice | null> {
    const query = db
      .select()
      .from(listenerDevices)
      .where(
        and(
          eq(listenerDevices.id, id),
          tenantId === null ? undefined : eq(listenerDevices.tenantId, tenantId),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    return row ?? null;
  }

  async rename(db: Executor, id: string, name: string): Promise<SelectListenerDevice> {
    const [row] = await db
      .update(listenerDevices)
      .set({ name })
      .where(eq(listenerDevices.id, id))
      .returning();
    if (!row) throw new Error('update returned no listener device');
    return row;
  }

  async revoke(
    db: Executor,
    id: string,
    values: { revokedBy: string | null; reason: ListenerRevokeReason; at: Date },
  ): Promise<SelectListenerDevice> {
    const [row] = await db
      .update(listenerDevices)
      .set({ revokedAt: values.at, revokedBy: values.revokedBy, revokeReason: values.reason })
      .where(eq(listenerDevices.id, id))
      .returning();
    if (!row) throw new Error('update returned no listener device');
    return row;
  }

  /** LSN-03, LSN-18: the device seen now, on this app version. */
  async touch(db: Executor, id: string, at: Date, appVersion: string): Promise<void> {
    await db
      .update(listenerDevices)
      .set({ lastSeenAt: at, appVersion })
      .where(eq(listenerDevices.id, id));
  }

  /** LSN-12: one more flag on the device; its flags now. */
  async flag(db: Executor, id: string): Promise<number> {
    const [row] = await db
      .update(listenerDevices)
      .set({ flags: sql`${listenerDevices.flags} + 1` })
      .where(eq(listenerDevices.id, id))
      .returning({ flags: listenerDevices.flags });
    return row?.flags ?? 0;
  }

  /** LSN-21: whether Lytro blocked this app installation. */
  async isBlocked(db: Executor, installationId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: listenerBlockedInstallations.installationId })
      .from(listenerBlockedInstallations)
      .where(eq(listenerBlockedInstallations.installationId, installationId));
    return row !== undefined;
  }

  /** LSN-21: the installation blocked (once); false when it already was. */
  async block(
    db: Executor,
    values: { installationId: string; reason: string; blockedBy: string | null },
  ): Promise<boolean> {
    const rows = await db
      .insert(listenerBlockedInstallations)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: listenerBlockedInstallations.installationId });
    return rows.length > 0;
  }

  /** LSN-21: the working devices an installation paired, in any shop, held. */
  async lockLiveForInstallation(
    db: Executor,
    installationId: string,
  ): Promise<SelectListenerDevice[]> {
    return db
      .select()
      .from(listenerDevices)
      .where(
        and(eq(listenerDevices.installationId, installationId), isNull(listenerDevices.revokedAt)),
      )
      .for('update');
  }

  /** LSN-07: the shop's state, suspension and name; null for no such shop. */
  async shopOf(db: Executor, tenantId: string): Promise<ListenerShopRow | null> {
    const [row] = await db
      .select({
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
        shopName: tenants.shopName,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    return row ?? null;
  }

  /**
   * LSN-05: codes spent, voided or run out before `codesBefore`, and devices revoked before `devicesBefore`, deleted;
   * how many of each.
   */
  async purge(
    db: Executor,
    codesBefore: Date,
    devicesBefore: Date,
  ): Promise<{ codes: number; devices: number }> {
    const codes = await db
      .delete(listenerPairingCodes)
      .where(
        or(
          lt(listenerPairingCodes.usedAt, codesBefore),
          lt(listenerPairingCodes.voidedAt, codesBefore),
          lt(listenerPairingCodes.expiresAt, codesBefore),
        ),
      )
      .returning({ id: listenerPairingCodes.id });
    const devices = await db
      .delete(listenerDevices)
      .where(
        and(isNotNull(listenerDevices.revokedAt), lt(listenerDevices.revokedAt, devicesBefore)),
      )
      .returning({ id: listenerDevices.id });
    return { codes: codes.length, devices: devices.length };
  }

  /** LSN-23: the shop's codes and devices, at day 60. */
  async deleteForTenant(db: Executor, tenantId: string): Promise<void> {
    await db.delete(listenerPairingCodes).where(eq(listenerPairingCodes.tenantId, tenantId));
    await db.delete(listenerDevices).where(eq(listenerDevices.tenantId, tenantId));
  }
}

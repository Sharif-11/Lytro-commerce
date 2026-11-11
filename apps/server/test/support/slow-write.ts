import type pg from 'pg';

// Races, the same way every run: one request's write sleeps inside its transaction, holding every lock it took, while a
// test starts a second request. Whether the second waits for the first, or runs past it, is then the server's doing.

/** What a slowed write is: a row trigger on `table` that sleeps whenever `when` (plpgsql, on NEW and OLD) holds. */
export interface SlowWrite {
  /** Names the trigger and its function; unique within a spec. */
  name: string;
  table: string;
  on: 'INSERT' | 'UPDATE';
  when: string;
  seconds?: number;
}

/** Slows the matching writes until the returned function is called, which a test calls in a `finally`. */
export async function slowWrites(admin: pg.Client, write: SlowWrite): Promise<() => Promise<void>> {
  await admin.query(`
    CREATE FUNCTION public.${write.name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF ${write.when} THEN PERFORM pg_sleep(${String(write.seconds ?? 1.5)}); END IF;
      RETURN NEW;
    END $$`);
  await admin.query(
    `CREATE TRIGGER ${write.name} BEFORE ${write.on} ON ${write.table} FOR EACH ROW EXECUTE FUNCTION public.${write.name}()`,
  );
  return async () => {
    await admin.query(`DROP TRIGGER IF EXISTS ${write.name} ON ${write.table}`);
    await admin.query(`DROP FUNCTION IF EXISTS public.${write.name}()`);
  };
}

/**
 * Waits until some session in the test's database is asleep in a slowed write, or waiting on a lock another holds, so the
 * next step starts only once the race is set.
 */
export async function untilSome(
  admin: pg.Client,
  state: 'asleep' | 'waiting on a lock',
  timeoutMs = 10_000,
): Promise<void> {
  const condition = state === 'asleep' ? "wait_event = 'PgSleep'" : "wait_event_type = 'Lock'";
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND ${condition}`,
    );
    if (Number(rows[0]?.n ?? 0) > 0) return;
    if (Date.now() > deadline) {
      throw new Error(`no session ${state} within ${String(timeoutMs)} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

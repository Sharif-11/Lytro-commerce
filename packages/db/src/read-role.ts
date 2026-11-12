import { sql } from 'drizzle-orm';
import type { Database } from './client';

/** The read pool's role (Slice 9.2, D9-13, DAT-45): SELECT only, and every transaction read-only by default. */
export const READ_ROLE = 'lytronix_read';

/**
 * What the read role may do is what the application role may read, and nothing else. After every migration run the
 * read role is granted USAGE on each schema the application uses, SELECT on each table and view it may SELECT, and
 * EXECUTE on each function it may call (row-level security's policies call some), so no migration has to remember it.
 * pg-boss's own tables are left out: no read pool query needs them. Only grants: a right taken from the application
 * role is taken from this one by the migration that takes it. Where either role is missing (a database made before
 * Slice 9.2, or a developer's own), nothing happens.
 */
const MIRROR_READ_GRANTS = sql.raw(`
DO $$
DECLARE
  target record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${READ_ROLE}')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    RETURN;
  END IF;
  FOR target IN
    SELECT n.nspname AS name FROM pg_namespace n
    WHERE left(n.nspname, 3) <> 'pg_' AND n.nspname NOT IN ('information_schema', 'pgboss')
      AND has_schema_privilege('lytronix_app', n.oid, 'USAGE')
      AND NOT has_schema_privilege('${READ_ROLE}', n.oid, 'USAGE')
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO ${READ_ROLE}', target.name);
  END LOOP;
  FOR target IN
    SELECT c.oid::regclass::text AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v', 'm')
      AND left(n.nspname, 3) <> 'pg_' AND n.nspname NOT IN ('information_schema', 'pgboss')
      AND has_table_privilege('lytronix_app', c.oid, 'SELECT')
      AND NOT has_table_privilege('${READ_ROLE}', c.oid, 'SELECT')
  LOOP
    EXECUTE format('GRANT SELECT ON %s TO ${READ_ROLE}', target.name);
  END LOOP;
  FOR target IN
    SELECT p.oid::regprocedure::text AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prokind = 'f'
      AND left(n.nspname, 3) <> 'pg_' AND n.nspname NOT IN ('information_schema', 'pgboss')
      AND has_function_privilege('lytronix_app', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('${READ_ROLE}', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO ${READ_ROLE}', target.name);
  END LOOP;
END $$`);

/** Brings the read role's grants up to the application role's reading rights. Run as the schema's owner. */
export class ReadRoleGrants {
  async sync(db: Database): Promise<void> {
    await db.execute(MIRROR_READ_GRANTS);
  }
}

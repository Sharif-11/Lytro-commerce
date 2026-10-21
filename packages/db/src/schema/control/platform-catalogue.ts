import { sql } from 'drizzle-orm';
import { bigint, check, smallint } from 'drizzle-orm/pg-core';
import { control } from '../shared';

// CCH-02, KNOWN-GAPS §66: the version of the platform's own attribute library. An operator renaming, re-colouring or
// retiring a platform attribute or value changes what every shop's catalogue shows, so each public cache key carries
// this beside the shop's own version, and one bump here reaches every shop at once. One row.
export const platformCatalogueState = control.table(
  'platform_catalogue_state',
  {
    id: smallint('id').primaryKey().default(1),
    version: bigint('version', { mode: 'number' }).notNull().default(1),
  },
  (t) => [check('platform_catalogue_state_one_row', sql`${t.id} = 1`)],
);

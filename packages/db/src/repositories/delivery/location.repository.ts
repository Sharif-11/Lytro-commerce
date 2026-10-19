import { asc } from 'drizzle-orm';
import {
  cities,
  locations,
  zillas,
  type SelectCity,
  type SelectLocation,
  type SelectZilla,
} from '../../schema';
import type { Executor } from '../../transactions';

/** CUS-08: the whole canonical list, in display order. */
export interface LocationList {
  cities: SelectCity[];
  zillas: SelectZilla[];
  locations: SelectLocation[];
}

// CUS-08: the platform's canonical zilla and thana list. Platform data, the same for every shop; no tenant context.
export class LocationRepository {
  async listAll(db: Executor): Promise<LocationList> {
    return {
      cities: await db.select().from(cities).orderBy(asc(cities.sortOrder)),
      zillas: await db.select().from(zillas).orderBy(asc(zillas.id)),
      locations: await db.select().from(locations).orderBy(asc(locations.id)),
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { RequestErrorRepository, type NewRequestError, type RequestErrorRow } from '@lytronix/db';
import type { RequestErrorStore } from '../../common/request-id/ports/request-error-store';
import { DatabaseService } from '../database.service';

/** Shops' server faults (D8-3), through the request error repository on the pool, each write on its own. */
@Injectable()
export class DrizzleRequestErrorStore implements RequestErrorStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(RequestErrorRepository) private readonly errors: RequestErrorRepository,
  ) {}

  record(row: NewRequestError): Promise<void> {
    return this.errors.insert(this.database.handle.db, row);
  }

  purgeBefore(before: Date): Promise<number> {
    return this.errors.purgeBefore(this.database.handle.db, before);
  }

  countSince(tenantId: string, since: Date): Promise<number> {
    return this.errors.countSince(this.database.handle.db, tenantId, since);
  }

  latest(
    tenantId: string,
    since: Date,
    beforeId: number | null,
    limit: number,
  ): Promise<RequestErrorRow[]> {
    return this.errors.latest(this.database.handle.db, tenantId, since, beforeId, limit);
  }
}

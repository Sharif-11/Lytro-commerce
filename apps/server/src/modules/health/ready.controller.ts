import { Controller, Get, Inject, Res } from '@nestjs/common';
import { SkipEdge } from '../../common/decorators/skip-edge';
import { SkipTenant } from '../../common/decorators/skip-tenant';
import { type DatabaseState, PrimaryWatch } from '../../database/primary-watch';

export interface ReadyReport {
  status: 'ready' | 'not_ready';
  database: DatabaseState;
  // Slice 9.4 brings Redis's own answer.
  redis: 'not_configured';
}

// The part of the HTTP response this uses, so the file doesn't depend on Express's types.
interface StatusResponse {
  status(code: number): unknown;
}

/**
 * The ready check (Slice 9.2, D9-21, DAT-44): whether this process should be sent requests. Caddy's balancing and a
 * deploy's rollout use it; `/health` stays the liveness check. Ready while the write pool reaches the primary, or
 * while it reaches nothing but the read pool still answers (reads go on, writes are refused with a retry hint,
 * DAT-42). Not ready when nothing answers, or when the write pool reaches a standby, so nothing is ever written there.
 * Each call checks afresh.
 */
@Controller('health/ready')
@SkipTenant()
@SkipEdge()
export class ReadyController {
  constructor(@Inject(PrimaryWatch) private readonly watch: Pick<PrimaryWatch, 'check'>) {}

  @Get()
  async ready(@Res({ passthrough: true }) response: StatusResponse): Promise<ReadyReport> {
    const database = await this.watch.check();
    const ready =
      database.writes === 'primary' ||
      (database.writes === 'unreachable' && database.reads === 'up');
    if (!ready) response.status(503);
    return { status: ready ? 'ready' : 'not_ready', database, redis: 'not_configured' };
  }
}

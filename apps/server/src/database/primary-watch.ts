import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { DatabaseProbe, type DatabaseServing } from '@lytronix/db';
import { SECOND_MS } from '../common/time';
import { DatabaseService } from './database.service';

/** What the write pool reaches: the primary, a standby by mistake (DAT-44), or nothing. */
export type WriteTarget = DatabaseServing | 'unreachable';

export interface DatabaseState {
  writes: WriteTarget;
  reads: 'up' | 'down';
}

// DAT-44: at start and every 30 seconds.
export const PRIMARY_CHECK_INTERVAL_MS = 30 * SECOND_MS;

const logger = new Logger('PrimaryWatch');

/**
 * Knows, to within 30 seconds, whether this process can save (Slice 9.2, D9-13, D9-14, DAT-42, DAT-44). The write pool
 * must reach the primary: while it reaches nothing, writes are refused with a retry hint (SavingGuard) and reads go on
 * from the read pool; if it reaches a standby, the ready check fails and the operator is alerted, and nothing is written
 * there. A write that fails on a lost connection checks again at once (ApiErrorFilter), so the refusal starts without
 * waiting for the next round. Not started under NODE_ENV=test, where tests call check() themselves.
 */
@Injectable()
export class PrimaryWatch implements OnModuleInit, OnModuleDestroy {
  private state: DatabaseState = { writes: 'primary', reads: 'up' };
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle' | 'reads'>,
    @Inject(DatabaseProbe) private readonly probe: DatabaseProbe,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    void this.check();
    this.timer = setInterval(() => void this.check(), PRIMARY_CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The state as last checked. */
  current(): DatabaseState {
    return this.state;
  }

  /** Whether a write may go ahead: only while the write pool reaches the primary. */
  canSave(): boolean {
    return this.state.writes === 'primary';
  }

  async check(): Promise<DatabaseState> {
    const writes = await this.serving(this.database.handle);
    const reads =
      this.database.reads === this.database.handle
        ? writes === 'unreachable'
          ? 'down'
          : 'up'
        : (await this.serving(this.database.reads)) === 'unreachable'
          ? 'down'
          : 'up';
    const next: DatabaseState = { writes, reads };
    if (next.writes !== this.state.writes) {
      // DAT-44: the write pool on a standby is a misconfiguration, never a mode to work in. Monitoring (Slice 9.6)
      // raises these lines to the operator.
      const say = next.writes === 'primary' ? logger.log.bind(logger) : logger.error.bind(logger);
      say(`the write pool now reaches: ${next.writes} (was ${this.state.writes})`);
    }
    this.state = next;
    return next;
  }

  private serving(handle: DatabaseService['handle']): Promise<WriteTarget> {
    return this.probe.serving(handle.db).catch((): WriteTarget => 'unreachable');
  }
}

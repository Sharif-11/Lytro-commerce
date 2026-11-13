import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_DEGRADED_FACTOR,
  PlatformSettingKey,
  QueueName,
  degradedModeValueSchema,
} from '@lytronix/validators';
import { MINUTE_MS, SECOND_MS } from '../../../common/time';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';

// How long one process trusts what it last read, so a busy minute's rate checks don't each ask the database. Another
// server's switch is seen within this, as the settings' own cache is (D2-7).
const READ_EVERY_MS = 5 * SECOND_MS;

/**
 * DAT-38 (Slice 9.5): the background jobs degraded mode holds back while it's on -- a shop's export, and the purchases
 * sent to Meta, whose retries can wait. Every other queue runs: orders, payments, courier booking, codes, tracking.
 */
export const PAUSED_QUEUES: ReadonlySet<string> = new Set<string>([
  QueueName.DataExport,
  QueueName.MetaPurchase,
]);

/** DAT-38: degraded mode as it stands: on or off, the notice it put up, and what it divides a per-minute limit by. */
export interface DegradedState {
  on: boolean;
  noticeId: string | null;
  factor: number;
}

/**
 * DAT-38, D9-14 (Phase 9 Slice 9.5): what degraded mode changes while the operator has it on. Every per-minute rate
 * limit is divided by the factor (plan limits and longer windows, such as sign-in codes an hour, never are); the
 * heavy routes are refused (PausedWhileDegraded) and the heavy queues held back (PgBossClient.workPausable). Read from
 * the platform settings, at most every few seconds in each process.
 */
@Injectable()
export class DegradedMode {
  private read: { state: DegradedState; until: number } | null = null;

  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  async state(): Promise<DegradedState> {
    const now = Date.now();
    if (this.read && this.read.until > now) return this.read.state;
    const mode = await this.settings.current(PlatformSettingKey.DegradedMode);
    const factor = await this.settings.current(PlatformSettingKey.DegradedFactor);
    const parsed = degradedModeValueSchema.safeParse(mode?.value);
    const state: DegradedState = {
      on: parsed.success && parsed.data.on,
      noticeId: parsed.success ? parsed.data.noticeId : null,
      factor: typeof factor?.value === 'number' ? factor.value : DEFAULT_DEGRADED_FACTOR,
    };
    this.read = { state, until: now + READ_EVERY_MS };
    return state;
  }

  /** After this process changes the switch, so it takes effect here at once. */
  forget(): void {
    this.read = null;
  }

  async on(): Promise<boolean> {
    return (await this.state()).on;
  }

  /** DAT-38: what a limit counted over this window is divided by now: the factor for a minute or less, else 1. */
  async divisor(windowMs: number): Promise<number> {
    if (windowMs > MINUTE_MS) return 1;
    const state = await this.state();
    return state.on ? state.factor : 1;
  }

  /** DAT-38: whether this queue's jobs wait for now. */
  async pauses(queue: string): Promise<boolean> {
    return PAUSED_QUEUES.has(queue) && (await this.on());
  }
}

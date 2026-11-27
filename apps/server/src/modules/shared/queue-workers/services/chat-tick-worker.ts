import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { LiveChat } from '../../../live-chat/services/live-chat';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// LIVE-CHAT-PLAN LC-5: each minute, the busy line for a chat that has waited too long within hours.
const CHAT_TICK_CRON = '* * * * *';
// LC-8, LC-11: once a night in Asia/Dhaka, clear of the other clean-up jobs (03:30 to 04:10).
const CHAT_PURGE_CRON = '25 4 * * *';
const CHAT_PURGE_TZ = 'Asia/Dhaka';

/** LC-5, LC-8, LC-11: the chat's minute pass and its nightly clean-up. Both safe to run twice. */
@Injectable()
export class ChatTickWorker implements OnModuleInit {
  private readonly logger = new Logger('ChatTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(LiveChat) private readonly chat: LiveChat,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.ChatTick);
    await this.pgBoss.boss.schedule(QueueName.ChatTick, CHAT_TICK_CRON, {});
    await this.pgBoss.workOnce(QueueName.ChatTick, async () => {
      const sent = await this.chat.tick();
      if (sent > 0) this.logger.log(`busy lines sent: ${String(sent)}`);
    });
    await this.pgBoss.boss.createQueue(QueueName.ChatPurgeTick);
    await this.pgBoss.boss.schedule(
      QueueName.ChatPurgeTick,
      CHAT_PURGE_CRON,
      {},
      { tz: CHAT_PURGE_TZ },
    );
    await this.pgBoss.workOnce(QueueName.ChatPurgeTick, async () => {
      const removed = await this.chat.purge();
      this.logger.log(
        `chat photos removed: ${String(removed.photos)}, messages removed: ${String(removed.messages)}`,
      );
    });
  }
}

import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { ChatMessageView, ChatReaderKind } from '@lytronix/validators';
import { LIMITS_REDIS } from '../../shared/limits/tokens';

/** What one process tells every process with a live connection (LC-3, §6). */
export type ChatEvent =
  | { type: 'message'; tenantId: string; shopName: string; message: ChatMessageView }
  | { type: 'read'; tenantId: string; readerKind: ChatReaderKind; readerId: string }
  | { type: 'closed'; tenantId: string };

export type ChatListener = (event: ChatEvent) => void;

const CHANNEL = 'lytro:chat';

/**
 * LC-3, §6: the chat's fan-out. Two API containers, each with several workers, and the job worker all write messages;
 * each process holds only its own browsers' sockets. So every event goes through one Redis channel that every process
 * with sockets listens on -- the Redis already running, never the database. Without REDIS_URL (development, tests) or
 * while Redis doesn't answer, an event still reaches this process's own sockets.
 */
@Injectable()
export class ChatBus implements OnModuleDestroy {
  private readonly logger = new Logger('ChatBus');
  private readonly listeners = new Set<ChatListener>();
  private subscriber: Redis | null = null;

  constructor(@Inject(LIMITS_REDIS) private readonly redis: Redis | null) {}

  async publish(event: ChatEvent): Promise<void> {
    if (this.redis !== null) {
      try {
        await this.redis.publish(CHANNEL, JSON.stringify(event));
        return;
      } catch (error) {
        this.logger.warn(`a chat event went to this process only: ${(error as Error).message}`);
      }
    }
    this.deliver(event);
  }

  /** A process with sockets listens; one Redis connection of its own, in subscriber mode. */
  listen(listener: ChatListener): void {
    this.listeners.add(listener);
    if (this.redis === null || this.subscriber !== null) return;
    const subscriber = this.redis.duplicate({
      enableOfflineQueue: true,
      commandTimeout: undefined,
    });
    this.subscriber = subscriber;
    subscriber.on('message', (channel: string, payload: string) => {
      if (channel !== CHANNEL) return;
      try {
        this.deliver(JSON.parse(payload) as ChatEvent);
      } catch (error) {
        this.logger.warn(`a chat event could not be read: ${(error as Error).message}`);
      }
    });
    void subscriber.subscribe(CHANNEL).catch((error: unknown) => {
      this.logger.warn(`the chat channel could not be joined yet: ${(error as Error).message}`);
    });
  }

  onModuleDestroy(): void {
    this.listeners.clear();
    this.subscriber?.disconnect();
    this.subscriber = null;
  }

  private deliver(event: ChatEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn(`a chat listener failed: ${(error as Error).message}`);
      }
    }
  }
}

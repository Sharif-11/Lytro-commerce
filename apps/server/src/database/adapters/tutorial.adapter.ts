import { Inject, Injectable } from '@nestjs/common';
import {
  TransactionRunner,
  TutorialRepository,
  UserRepository,
  type InsertTutorialVideo,
  type SelectTutorialVideo,
  type Transaction,
  type TutorialOldFiles,
} from '@lytronix/db';
import type { TutorialScreen } from '@lytronix/validators';
import type { TutorialStore } from '../../modules/tutorials/ports/tutorial-store';
import { DatabaseService } from '../database.service';

/** TENANT-DASHBOARD-DESIGN §7.49, OPERATOR-CONSOLE-DESIGN §10h: the tutorials' rows through TutorialRepository. */
@Injectable()
export class DrizzleTutorialStore implements TutorialStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(TutorialRepository) private readonly tutorials: TutorialRepository,
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  private get db() {
    return this.database.handle.db;
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, work);
  }

  inShop<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, async (tx) => {
      await this.transactions.setTenantContext(tx, tenantId);
      return work(tx);
    });
  }

  live(): Promise<SelectTutorialVideo[]> {
    return this.tutorials.live(this.db);
  }

  nextVersions(): Promise<Map<string, number>> {
    return this.tutorials.nextVersions(this.db);
  }

  lockPart(tx: Transaction, tutorialKey: string): Promise<void> {
    return this.tutorials.lockPart(tx, tutorialKey);
  }

  liveOf(tx: Transaction, tutorialKey: string): Promise<SelectTutorialVideo | null> {
    return this.tutorials.liveOf(tx, tutorialKey);
  }

  claim(
    tx: Transaction,
    row: Omit<InsertTutorialVideo, 'version' | 'videoKey' | 'coverKey'>,
    keysOf: (version: number) => { videoKey: string; coverKey: string },
  ): Promise<SelectTutorialVideo> {
    return this.tutorials.claim(tx, row, keysOf);
  }

  publish(tx: Transaction, id: string, at: Date): Promise<void> {
    return this.tutorials.publish(tx, id, at);
  }

  retire(tx: Transaction, id: string, at: Date, by: string | null): Promise<void> {
    return this.tutorials.retire(tx, id, at, by);
  }

  retireUnfinished(tx: Transaction, before: Date, at: Date): Promise<number> {
    return this.tutorials.retireUnfinished(tx, before, at);
  }

  oldFiles(before: Date, limit: number): Promise<TutorialOldFiles[]> {
    return this.tutorials.oldFiles(this.db, before, limit);
  }

  markFilesDeleted(tx: Transaction, ids: readonly string[], at: Date): Promise<void> {
    return this.tutorials.markFilesDeleted(tx, ids, at);
  }

  async ownerUserId(tx: Transaction, tenantId: string): Promise<string | null> {
    return (await this.users.findOwner(tx, tenantId))?.id ?? null;
  }

  watched(tx: Transaction, tenantId: string, userId: string): Promise<string[]> {
    return this.tutorials.watched(tx, tenantId, userId);
  }

  markWatched(
    tx: Transaction,
    tenantId: string,
    userId: string,
    tutorialKey: string,
  ): Promise<void> {
    return this.tutorials.markWatched(tx, tenantId, userId, tutorialKey);
  }

  dismissed(tx: Transaction, tenantId: string, userId: string): Promise<TutorialScreen[]> {
    return this.tutorials.dismissed(tx, tenantId, userId);
  }

  dismiss(
    tx: Transaction,
    tenantId: string,
    userId: string,
    screen: TutorialScreen,
  ): Promise<void> {
    return this.tutorials.dismiss(tx, tenantId, userId, screen);
  }

  hasOrder(tx: Transaction, tenantId: string): Promise<boolean> {
    return this.tutorials.hasOrder(tx, tenantId);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  ListenerMessageRepository,
  ListenerRepository,
  TransactionRunner,
  type ListenerShopRow,
  type NewListenerDevice,
  type SelectListenerDevice,
  type SelectListenerPairingCode,
  type Transaction,
} from '@lytronix/db';
import type { ListenerRevokeReason } from '@lytronix/validators';
import type { ListenerStore } from '../../modules/listener/ports/listener-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleListenerStore implements ListenerStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ListenerRepository) private readonly listener: ListenerRepository,
    @Inject(ListenerMessageRepository) private readonly messages: ListenerMessageRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  insertCode(
    tx: Transaction,
    values: {
      tenantId: string | null;
      codeHash: string;
      createdBy: string | null;
      expiresAt: Date;
    },
  ): Promise<SelectListenerPairingCode> {
    return this.listener.insertCode(tx, values);
  }

  lockCode(tx: Transaction, codeHash: string): Promise<SelectListenerPairingCode | null> {
    return this.listener.lockCode(tx, codeHash);
  }

  spendCode(tx: Transaction, id: string, at: Date): Promise<void> {
    return this.listener.spendCode(tx, id, at);
  }

  addTry(tx: Transaction, id: string, max: number, at: Date): Promise<number> {
    return this.listener.addTry(tx, id, max, at);
  }

  countLive(tx: Transaction, tenantId: string): Promise<number> {
    return this.listener.countLive(tx, tenantId);
  }

  insertDevice(tx: Transaction, values: NewListenerDevice): Promise<SelectListenerDevice> {
    return this.listener.insertDevice(tx, values);
  }

  findByTokenHash(tx: Transaction, tokenHash: string): Promise<SelectListenerDevice | null> {
    return this.listener.findByTokenHash(tx, tokenHash);
  }

  listForLytro(tx: Transaction): Promise<SelectListenerDevice[]> {
    return this.listener.listForLytro(tx);
  }

  listForTenant(tx: Transaction, tenantId: string): Promise<SelectListenerDevice[]> {
    return this.listener.listForTenant(tx, tenantId);
  }

  findDevice(
    tx: Transaction,
    tenantId: string | null,
    id: string,
    lock: boolean,
  ): Promise<SelectListenerDevice | null> {
    return this.listener.findDevice(tx, tenantId, id, lock);
  }

  rename(tx: Transaction, id: string, name: string): Promise<SelectListenerDevice> {
    return this.listener.rename(tx, id, name);
  }

  revoke(
    tx: Transaction,
    id: string,
    values: { revokedBy: string | null; reason: ListenerRevokeReason; at: Date },
  ): Promise<SelectListenerDevice> {
    return this.listener.revoke(tx, id, values);
  }

  touch(tx: Transaction, id: string, at: Date, appVersion: string): Promise<void> {
    return this.listener.touch(tx, id, at, appVersion);
  }

  startTestMode(tx: Transaction, id: string, until: Date): Promise<void> {
    return this.listener.startTestMode(tx, id, until);
  }

  flag(tx: Transaction, id: string): Promise<number> {
    return this.listener.flag(tx, id);
  }

  isBlocked(tx: Transaction, installationId: string): Promise<boolean> {
    return this.listener.isBlocked(tx, installationId);
  }

  block(
    tx: Transaction,
    values: { installationId: string; reason: string; blockedBy: string | null },
  ): Promise<boolean> {
    return this.listener.block(tx, values);
  }

  lockLiveForInstallation(
    tx: Transaction,
    installationId: string,
  ): Promise<SelectListenerDevice[]> {
    return this.listener.lockLiveForInstallation(tx, installationId);
  }

  shopOf(tx: Transaction, tenantId: string): Promise<ListenerShopRow | null> {
    return this.listener.shopOf(tx, tenantId);
  }

  purge(
    tx: Transaction,
    codesBefore: Date,
    devicesBefore: Date,
  ): Promise<{ codes: number; devices: number }> {
    return this.listener.purge(tx, codesBefore, devicesBefore);
  }

  async deleteForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.messages.deleteForTenant(tx, tenantId);
    await this.listener.deleteForTenant(tx, tenantId);
  }
}

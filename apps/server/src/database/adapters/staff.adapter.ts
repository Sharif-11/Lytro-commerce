import { Inject, Injectable } from '@nestjs/common';
import {
  SessionRepository,
  TransactionRunner,
  UserRepository,
  type SelectUser,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { StaffStore } from '../../modules/staff/ports/staff-store';
import type { StaffCredentials, StaffRecord } from '../../modules/staff/types/staff';
import { DatabaseService } from '../database.service';

// The unique index on a shop's staff phones (STF-06 within one shop).
const PHONE_INDEX = 'users_tenant_phone_idx';
// The unique link to a platform account: the phone is already staff in another shop (STF-06).
const SUBSCRIBER_INDEX = 'users_subscriber_key';

function toCredentials(row: SelectUser): StaffCredentials {
  return {
    userId: row.id,
    isOwner: row.isOwner,
    active: row.active,
    subscriberId: row.subscriberId,
    passwordHash: row.passwordHash,
    mustSetPassword: row.mustSetPassword,
  };
}

function toRecord(row: SelectUser): StaffRecord {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    isOwner: row.isOwner,
    active: row.active,
    createdAt: row.createdAt,
  };
}

/** Database-backed staff store. Every method runs inside a transaction that carries the shop's tenant context. */
@Injectable()
export class DrizzleStaffStore implements StaffStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  insertOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string | null; email: string | null; name: string },
  ): Promise<void> {
    return this.users.insertOwner(tx, values);
  }

  async lockSeats(tx: Transaction, tenantId: string): Promise<void> {
    await this.users.lockSeats(tx, tenantId);
  }

  async listStaff(tx: Transaction, tenantId: string): Promise<StaffRecord[]> {
    return (await this.users.listUsers(tx, tenantId)).map(toRecord);
  }

  countActive(tx: Transaction, tenantId: string): Promise<number> {
    return this.users.countActive(tx, tenantId);
  }

  async findStaff(tx: Transaction, tenantId: string, userId: string): Promise<StaffRecord | null> {
    const row = await this.users.findUser(tx, tenantId, userId);
    return row ? toRecord(row) : null;
  }

  async insertStaff(
    tx: Transaction,
    values: {
      tenantId: string;
      subscriberId: string;
      phone: string;
      name: string | null;
      passwordHash: string;
    },
  ): Promise<StaffRecord> {
    try {
      return toRecord(await this.users.insertStaff(tx, values));
    } catch (error) {
      if (
        this.transactions.isUniqueViolation(error, PHONE_INDEX) ||
        this.transactions.isUniqueViolation(error, SUBSCRIBER_INDEX)
      )
        throw new UniqueViolation('phone');
      throw error;
    }
  }

  async setActive(
    tx: Transaction,
    tenantId: string,
    userId: string,
    active: boolean,
  ): Promise<StaffRecord | null> {
    const row = await this.users.setActive(tx, tenantId, userId, active);
    return row ? toRecord(row) : null;
  }

  async findOwner(tx: Transaction, tenantId: string): Promise<StaffRecord | null> {
    const row = await this.users.findOwner(tx, tenantId);
    return row ? toRecord(row) : null;
  }

  async findCredentialsById(
    tx: Transaction,
    tenantId: string,
    userId: string,
  ): Promise<StaffCredentials | null> {
    const row = await this.users.findUser(tx, tenantId, userId);
    return row ? toCredentials(row) : null;
  }

  setPassword(
    tx: Transaction,
    tenantId: string,
    userId: string,
    passwordHash: string,
    mustSetPassword: boolean,
  ): Promise<void> {
    return this.users.setPassword(tx, tenantId, userId, passwordHash, mustSetPassword);
  }

  async findCredentialsByPhone(
    tx: Transaction,
    tenantId: string,
    phone: string,
  ): Promise<StaffCredentials | null> {
    const row = await this.users.findUserByPhone(tx, tenantId, phone);
    return row ? toCredentials(row) : null;
  }

  revokeSessionsOf(tx: Transaction, userId: string, at: Date): Promise<void> {
    return this.sessions.revokeAllForUser(tx, userId, at);
  }
}

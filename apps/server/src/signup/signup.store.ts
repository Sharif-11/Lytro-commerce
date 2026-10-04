import {
  countChallengesSince,
  createShopForVerifiedPhone,
  insertChallenge,
  insertSmsMessage,
  latestChallenge,
  lockChallenge,
  recordWrongAttempt,
  type CreatedShop,
  type Database,
} from '@lytronix/db';

// The storage the sign-up service needs. The service depends on this interface only, so its rules can be
// tested with a fake store and a fake clock.
export interface ChallengeRecord {
  id: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  lockedUntil: Date | null;
  createdAt: Date;
}

export interface CreateShopRequest {
  challengeId: string;
  phone: string;
  ownerName: string;
  shopName: string;
  slug: string;
  liveUrl: string;
  shopReadyBody: (liveUrl: string) => string;
  now: Date;
}

export interface SignupStore {
  latestChallenge(phone: string): Promise<ChallengeRecord | null>;
  countChallengesSince(phone: string, since: Date): Promise<number>;
  createChallenge(input: { phone: string; codeHash: string; expiresAt: Date }): Promise<string>;
  recordWrongAttempt(challengeId: string): Promise<number>;
  lockChallenge(challengeId: string, until: Date): Promise<void>;
  sendSms(message: { toPhone: string; kind: 'otp' | 'shop_ready'; body: string }): Promise<void>;
  createShop(request: CreateShopRequest): Promise<CreatedShop>;
}

/** Database-backed store. The only place sign-up code touches Drizzle, through @lytronix/db. */
export class DrizzleSignupStore implements SignupStore {
  constructor(private readonly db: Database) {}

  async latestChallenge(phone: string): Promise<ChallengeRecord | null> {
    const row = await latestChallenge(this.db, phone);
    return row
      ? {
          id: row.id,
          codeHash: row.codeHash,
          expiresAt: row.expiresAt,
          consumedAt: row.consumedAt,
          lockedUntil: row.lockedUntil,
          createdAt: row.createdAt,
        }
      : null;
  }

  countChallengesSince(phone: string, since: Date): Promise<number> {
    return countChallengesSince(this.db, phone, since);
  }

  async createChallenge(input: {
    phone: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<string> {
    return (await insertChallenge(this.db, input)).id;
  }

  recordWrongAttempt(challengeId: string): Promise<number> {
    return recordWrongAttempt(this.db, challengeId);
  }

  lockChallenge(challengeId: string, until: Date): Promise<void> {
    return lockChallenge(this.db, challengeId, until);
  }

  async sendSms(message: {
    toPhone: string;
    kind: 'otp' | 'shop_ready';
    body: string;
  }): Promise<void> {
    await insertSmsMessage(this.db, message);
    // D6: the stub provider prints to the console as well as recording to the outbox.
    if (process.env['NODE_ENV'] !== 'test') {
      console.info(`[sms-stub] to ${message.toPhone}: ${message.body}`);
    }
  }

  createShop(request: CreateShopRequest): Promise<CreatedShop> {
    return createShopForVerifiedPhone(this.db, {
      challengeId: request.challengeId,
      phone: request.phone,
      ownerName: request.ownerName,
      shopName: request.shopName,
      slug: request.slug,
      liveUrl: request.liveUrl,
      shopReadyBody: request.shopReadyBody,
      now: request.now,
    });
  }
}

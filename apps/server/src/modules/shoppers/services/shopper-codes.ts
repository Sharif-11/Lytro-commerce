import { Inject, Injectable } from '@nestjs/common';
import {
  LedgerEntryType,
  RateKey,
  SHOPPER_CODES_PER_SHOP_PER_HOUR,
  type Language,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { SmsDeliveryError } from '../../../common/errors/sms-delivery';
import { HOUR_MS } from '../../../common/time';
import { BalanceService } from '../../balance/services/balance.service';
import { RateService } from '../../balance/services/rate.service';
import {
  CODE_TTL_MS,
  HOURLY_CODE_CAP,
  RESEND_COOLDOWN_MS,
} from '../../identity/services/one-time-code.service';
import { OneTimeCodeHasher } from '../../identity/services/one-time-code-hasher';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import type { ShopperStore } from '../ports/shopper-store';
import { SHOPPER_STORE, SHOPPERS_CLOCK } from '../tokens';
import type { ShopperCodeSent } from '../types/shoppers';

/** What the code's SMS says, in the shopper's language, under the shop's name. */
function codeText(lang: Language, shopName: string, code: string): string {
  return lang === 'en'
    ? `${shopName}: your sign-up code is ${code}. It expires in 5 minutes. Don't share it.`
    : `${shopName}: আপনার সাইন আপ কোড ${code}। 5 মিনিটের মধ্যে ব্যবহার করুন। কাউকে দেবেন না।`;
}

/**
 * CUS-04, SMS-09, SMS-11 (Phase 4 Slice 4.4b, read agreed 2026-10-30): the code a shopper makes an account with, sent
 * once to the phone. Each is charged to the shop's balance at the SMS rate -- its units are the text's length over the
 * unit size, whatever the language -- never from the free essential allowance, and is not sent at all when the
 * balance can't cover it. A phone waits a minute between codes and gets five an hour; the shop sends at most
 * SHOPPER_CODES_PER_SHOP_PER_HOUR, so no one can spend its balance on codes. An SMS that fails to send costs nothing:
 * the charge is reversed and the code removed (SMS-08).
 */
@Injectable()
export class ShopperCodes {
  constructor(
    @Inject(SHOPPER_STORE) private readonly store: ShopperStore,
    @Inject(OneTimeCodeHasher) private readonly hasher: OneTimeCodeHasher,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(SHOPPERS_CLOCK) private readonly clock: () => Date,
  ) {}

  async send(
    shop: { id: string; name: string },
    phone: string,
    lang: Language,
  ): Promise<ShopperCodeSent> {
    const now = this.clock();
    const code = this.hasher.generate();
    const body = codeText(lang, shop.name, code);
    const sent = await this.store.run(shop.id, async (tx) => {
      if (await this.store.findByPhone(tx, shop.id, phone)) {
        throw new ApiError('conflict', 'ShopperAlreadyRegistered', {});
      }
      const latest = await this.store.latestCode(tx, shop.id, phone);
      const since = now.getTime() - (latest?.createdAt.getTime() ?? 0);
      if (latest && since < RESEND_COOLDOWN_MS) {
        throw new ApiError(
          'rate_limited',
          'CodeSentRecently',
          {},
          Math.ceil((RESEND_COOLDOWN_MS - since) / 1000),
        );
      }
      const hourAgo = new Date(now.getTime() - HOUR_MS);
      if (
        (await this.store.countCodesSince(tx, shop.id, phone, hourAgo)) >= HOURLY_CODE_CAP ||
        (await this.store.countCodesSince(tx, shop.id, null, hourAgo)) >=
          SHOPPER_CODES_PER_SHOP_PER_HOUR
      ) {
        throw new ApiError('rate_limited', 'TooManyCodesRequested', {}, HOUR_MS / 1000);
      }
      const entry = await this.charge(tx, shop.id, body);
      const row = await this.store.insertCode(tx, shop.id, {
        phone,
        codeHash: this.hasher.hash(code, phone),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        createdAt: now,
      });
      const message = await this.messaging.queueShopperCode(tx, phone, body);
      return { entry, codeId: row.id, message };
    });
    try {
      await this.messaging.deliverOtp(sent.message);
    } catch (error) {
      if (!(error instanceof SmsDeliveryError)) throw error;
      await this.store.run(shop.id, async (tx) => {
        await this.store.deleteCode(tx, shop.id, sent.codeId);
        await this.balance.credit(tx, {
          tenantId: shop.id,
          type: LedgerEntryType.Reversal,
          amount: sent.entry.amount.replace('-', ''),
          reference: { reverses: sent.entry.id, reason: 'sms_not_sent' },
        });
      });
      throw new ApiError('service_unavailable', 'CodeSendFailed', {}, RESEND_COOLDOWN_MS / 1000);
    }
    return { expiresInSeconds: CODE_TTL_MS / 1000, resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
  }

  /** SMS-05, SMS-09, agreed 2026-10-30: the code's units at the SMS rate, from the balance and never below zero. */
  private async charge(
    tx: Parameters<Parameters<ShopperStore['run']>[1]>[0],
    tenantId: string,
    body: string,
  ): Promise<{ id: number; amount: string }> {
    const [rate, unitSize] = await Promise.all([
      this.rates.current(RateKey.SmsPerUnit),
      this.rates.current(RateKey.SmsUnitSizeChars),
    ]);
    if (!rate || !unitSize) throw new Error('SMS rates are not seeded');
    const units = Math.ceil(Array.from(body).length / Number(unitSize.value));
    try {
      return await this.balance.charge(tx, {
        tenantId,
        type: LedgerEntryType.Sms,
        units: String(units),
        rateUsed: rate.value,
        reference: { kind: 'shopper_code' },
      });
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.messageKey === 'InsufficientBalance' || error.messageKey === 'BalanceFrozen')
      ) {
        throw new ApiError('quota_exceeded', 'ShopCannotSendCode', {});
      }
      throw error;
    }
  }
}

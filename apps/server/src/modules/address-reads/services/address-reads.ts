import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  AiProvider,
  LedgerEntryType,
  PerUsePaidFrom,
  PlatformSettingKey,
  RateKey,
  type AddressRead,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { SlidingWindow } from '../../../common/sliding-window';
import { MINUTE_MS, SECOND_MS } from '../../../common/time';
import { BalanceService } from '../../balance/services/balance.service';
import { rateToPaisa, toPaisa } from '../../balance/services/money';
import { RateService } from '../../balance/services/rate.service';
import { LocationService } from '../../delivery/services/location.service';
import { PlaceMatcher } from '../../delivery/services/place-matching';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { AddressReaders, ReaderAnswer } from '../ports/address-reader';
import type { AddressReadStore } from '../ports/address-read-store';
import { ADDRESS_READ_CLOCK, ADDRESS_READ_STORE, ADDRESS_READERS } from '../tokens';
import { foundSomething, shapeRead } from './address-details';

// D7-4 (Slice 7.6's read, 2026-11-06): the model the owner chose after the tries, when the operator has set none.
export const DEFAULT_ADDRESS_READ_MODEL = 'gemini-3.5-flash-lite';
// ORD-33 (Slice 7.6): one shop's reads in any minute, a flood guard, when the operator has set no figure.
export const DEFAULT_ADDRESS_READS_PER_SHOP_PER_MINUTE = 30;

/** Who asked for a read. */
export interface AddressReadActor {
  tenantId: string;
  /** The staff member; null for the owner's own session (AUD-02). */
  userId: string | null;
}

/** PLN-20, D7-36 (Slice 7.7): one allowance as the shop's pages show it. */
export interface AllowanceFigure {
  purchaseId: string;
  total: number;
  used: number;
  left: number;
  endsAt: Date;
}

/** PLN-20, D7-36 (Slice 7.7): this cycle's reads: the allowances, and the reads paid one by one at the rate. */
export interface AddressReadFigures {
  rate: string;
  allowances: AllowanceFigure[];
  outsideAllowance: { count: number; cost: string };
}

/**
 * ORD-30 to ORD-34, PLN-20 (Phase 7 Slice 7.6, read agreed 2026-11-06): reading a customer's delivery details from a
 * pasted message -- name, phone, zilla, thana, address and a delivery note -- for the order form, nothing saved. A read
 * the shop can't pay for is refused before the AI is asked: no balance left at the rate and no allowance use left, or a
 * frozen balance. A read that found nothing to use, or an answer that couldn't be used, or no answer, costs nothing.
 * Otherwise an allowance pays, the soonest to end first, or the balance at the rate, never below zero; the trial pays
 * the same way (ORD-34). The per-minute window is in memory, exact while there is one server (D3-2).
 */
@Injectable()
export class AddressReads implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AddressReads.name);
  private readonly windows = new SlidingWindow(MINUTE_MS);
  private sweeper: NodeJS.Timeout | null = null;
  private places: Promise<PlaceMatcher> | null = null;

  constructor(
    @Inject(ADDRESS_READERS) private readonly readers: AddressReaders,
    @Inject(ADDRESS_READ_STORE) private readonly store: AddressReadStore,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(LocationService) private readonly locations: LocationService,
    @Inject(ADDRESS_READ_CLOCK) private readonly clock: () => Date,
  ) {}

  /**
   * PLN-20, D7-36 (Slice 7.7): what the shop's reads allowances hold, have used and still have, the soonest to end
   * first, and the reads paid one by one since the cycle began -- for Usage, the add-on shop and the paste card.
   */
  async figures(tenantId: string, cycleStart: Date): Promise<AddressReadFigures> {
    const [allowances, outside, rate] = await Promise.all([
      this.allowances(tenantId),
      this.balance.runStandalone(tenantId, (tx) =>
        this.store.paidFromBalanceSince(tx, tenantId, cycleStart),
      ),
      this.rates.current(RateKey.AiExtraction),
    ]);
    return { rate: rate?.value ?? '0', allowances, outsideAllowance: outside };
  }

  /** PLN-20 (Slice 7.7): the shop's reads allowances that count now, the soonest to end first. */
  async allowances(tenantId: string): Promise<AllowanceFigure[]> {
    const held = await this.balance.runStandalone(tenantId, (tx) =>
      this.store.allowancesFor(tx, tenantId),
    );
    return held.map((allowance) => ({
      purchaseId: allowance.id,
      total: allowance.total,
      used: allowance.used,
      left: allowance.left,
      endsAt: allowance.expiresAt,
    }));
  }

  onModuleInit(): void {
    this.sweeper = setInterval(() => {
      this.windows.sweep(Date.now());
    }, MINUTE_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  async read(actor: AddressReadActor, text: string): Promise<AddressRead> {
    await this.admit(actor.tenantId);
    const rate = await this.rate();
    await this.refuseIfUnpaid(actor.tenantId, rate);
    const answer = await this.ask(text);
    if (answer.kind === 'unreadable') {
      throw new ApiError('service_unavailable', 'AddressReadUnreadable', {});
    }
    const shaped = shapeRead(answer.details, await this.matcher());
    if (!foundSomething(shaped)) return { ...shaped, charged: null };
    const charged = await this.charge(actor, Array.from(text).length, shaped.confidence, rate);
    return { ...shaped, charged };
  }

  /** ORD-33: one shop's reads a minute; a refused read isn't counted. */
  private async admit(tenantId: string): Promise<void> {
    const setting = await this.settings.current(PlatformSettingKey.AddressReadsPerShopPerMinute);
    const limit =
      typeof setting?.value === 'number'
        ? setting.value
        : DEFAULT_ADDRESS_READS_PER_SHOP_PER_MINUTE;
    const verdict = this.windows.take(`address-read:${tenantId}`, limit, this.clock().getTime());
    if (!verdict.allowed) {
      throw new ApiError(
        'rate_limited',
        'TooManyAddressReads',
        {},
        Math.max(1, Math.ceil(verdict.resetMs / SECOND_MS)),
      );
    }
  }

  private async rate(): Promise<string> {
    const rate = await this.rates.current(RateKey.AiExtraction);
    if (!rate) throw new Error('the ai_extraction rate is not seeded');
    return rate.value;
  }

  /**
   * ORD-34, BAL-06, BAL-07: refused before the AI is asked -- a frozen balance, or no allowance use left and less than
   * the rate on the balance. Nothing is held: the charge checks again once the read is back.
   */
  private async refuseIfUnpaid(tenantId: string, rate: string): Promise<void> {
    await this.balance.runStandalone(tenantId, async (tx) => {
      const held = await this.balance.heldWithin(tx, tenantId);
      if (held.frozen) throw new ApiError('tenant_offline', 'BalanceFrozen', {});
      const allowances = await this.store.allowancesFor(tx, tenantId);
      if (allowances.some((allowance) => allowance.left > 0)) return;
      if (toPaisa(held.amount) < rateToPaisa(rate)) {
        throw new ApiError('quota_exceeded', 'InsufficientBalance', { balance: held.amount });
      }
    });
  }

  /** AI-10: the operator's AI and model. No answer, or none in time, is refused, and charges nothing (ORD-33). */
  private async ask(text: string): Promise<ReaderAnswer> {
    const [provider, model] = await Promise.all([
      this.settings.current(PlatformSettingKey.AddressReadProvider),
      this.settings.current(PlatformSettingKey.AddressReadModel),
    ]);
    const chosen = Object.values<unknown>(AiProvider).includes(provider?.value)
      ? (provider?.value as AiProvider)
      : AiProvider.Gemini;
    try {
      return await this.readers[chosen].read(
        text,
        typeof model?.value === 'string' ? model.value : DEFAULT_ADDRESS_READ_MODEL,
      );
    } catch (error) {
      this.logger.warn(
        `address read failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ApiError('service_unavailable', 'AddressReadUnavailable', {});
    }
  }

  /** ORD-31, CUS-08: Lytro's own list, read once; it changes only with a migration. */
  private matcher(): Promise<PlaceMatcher> {
    this.places ??= this.locations.list().then(({ zillas }) => new PlaceMatcher(zillas));
    return this.places;
  }

  /**
   * ORD-34, PLN-20: an allowance use, the soonest-ending allowance first, or the rate from the balance, in one
   * transaction with the read's row, so two reads at once can't both take an allowance's last use.
   */
  private charge(
    actor: AddressReadActor,
    inputChars: number,
    confidence: number,
    rate: string,
  ): Promise<NonNullable<AddressRead['charged']>> {
    return this.balance.runStandalone(actor.tenantId, async (tx) => {
      const read = {
        tenantId: actor.tenantId,
        userId: actor.userId,
        inputChars,
        confidence: confidence.toFixed(3),
      };
      const allowances = await this.store.allowancesFor(tx, actor.tenantId);
      const paying = allowances.find((allowance) => allowance.left > 0);
      if (paying) {
        await this.store.record(tx, {
          ...read,
          paidFrom: PerUsePaidFrom.Allowance,
          cost: '0',
          addonPurchaseId: paying.id,
        });
        const left = allowances.reduce((sum, allowance) => sum + allowance.left, 0) - 1;
        return { paidFrom: PerUsePaidFrom.Allowance, amount: '0.00', allowanceLeft: left };
      }
      let cost = '0.00';
      if (rateToPaisa(rate) > 0n) {
        const entry = await this.balance.charge(tx, {
          tenantId: actor.tenantId,
          type: LedgerEntryType.Extraction,
          units: '1',
          rateUsed: rate,
          reference: { kind: 'address_read' },
        });
        cost = entry.amount.replace('-', '');
      }
      await this.store.record(tx, {
        ...read,
        paidFrom: PerUsePaidFrom.Balance,
        cost,
        addonPurchaseId: null,
      });
      return { paidFrom: PerUsePaidFrom.Balance, amount: cost, allowanceLeft: null };
    });
  }
}

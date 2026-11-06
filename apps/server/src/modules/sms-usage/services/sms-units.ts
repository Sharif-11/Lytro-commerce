import { Inject, Injectable } from '@nestjs/common';
import { RateKey } from '@lytronix/validators';
import { RateService } from '../../balance/services/rate.service';

/** An SMS's size and price as Lytro charges it. */
export interface SmsPrice {
  units: number;
  /** The SMS rate per unit, as the rates hold it. */
  rate: string;
}

/**
 * SMS-09, D7-13: an SMS counts its characters over the unit size, whatever the language, for charging and for the
 * free allowance alike. The one place that works it out, so no two callers count differently.
 */
@Injectable()
export class SmsUnits {
  constructor(@Inject(RateService) private readonly rates: RateService) {}

  async priceOf(body: string): Promise<SmsPrice> {
    const [rate, unitSize] = await Promise.all([
      this.rates.current(RateKey.SmsPerUnit),
      this.rates.current(RateKey.SmsUnitSizeChars),
    ]);
    if (!rate || !unitSize) throw new Error('SMS rates are not seeded');
    return {
      units: Math.max(1, Math.ceil(Array.from(body).length / Number(unitSize.value))),
      rate: rate.value,
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { RateKey, smsUnitsOf } from '@lytronix/validators';
import { RateService } from '../../balance/services/rate.service';

/** An SMS's size and price as Lytro charges it. */
export interface SmsPrice {
  units: number;
  /** The SMS rate per unit, as the rates hold it. */
  rate: string;
}

/** SMS-09, RAT-13: the current unit size and the rate per unit. */
export interface SmsRates {
  unitSize: number;
  rate: string;
}

/**
 * SMS-09, D7-13: an SMS counts its characters over the unit size, whatever the language, for charging and for the
 * free allowance alike. The one place the server works it out (with `smsUnitsOf`, the count a screen shows too), so no
 * two callers count differently.
 */
@Injectable()
export class SmsUnits {
  constructor(@Inject(RateService) private readonly rates: RateService) {}

  async current(): Promise<SmsRates> {
    const [rate, unitSize] = await Promise.all([
      this.rates.current(RateKey.SmsPerUnit),
      this.rates.current(RateKey.SmsUnitSizeChars),
    ]);
    if (!rate || !unitSize) throw new Error('SMS rates are not seeded');
    return { unitSize: Number(unitSize.value), rate: rate.value };
  }

  async priceOf(body: string): Promise<SmsPrice> {
    const { unitSize, rate } = await this.current();
    return { units: smsUnitsOf(body, unitSize), rate };
  }
}

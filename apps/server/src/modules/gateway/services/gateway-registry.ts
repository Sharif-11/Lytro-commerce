import { Inject, Injectable } from '@nestjs/common';
import type { PaymentMethod } from '@lytronix/validators';
import type { WalletGateway } from '../ports/wallet-gateway';
import { BkashGateway } from './bkash-gateway';

/**
 * WAL-19, D5-7 (Phase 5 Slice 5.7): the gateways there are, by the method they serve, as courier adapters are registered: bKash's
 * today, and adding another is one more entry here, changing nothing for shops on a wallet's other ways.
 */
@Injectable()
export class GatewayRegistry {
  private readonly byMethod: ReadonlyMap<PaymentMethod, WalletGateway>;

  constructor(@Inject(BkashGateway) bkash: BkashGateway) {
    this.byMethod = new Map<PaymentMethod, WalletGateway>([[bkash.method, bkash]]);
  }

  forMethod(method: PaymentMethod): WalletGateway | undefined {
    return this.byMethod.get(method);
  }
}

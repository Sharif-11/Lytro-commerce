import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { PaymentMethod, PaymentMethodKind, WalletAccountType } from '@lytronix/validators';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import type { ShopperPaymentMethod } from '../../payment-methods/types/payment-methods';
import type { PublicApiRequest } from '../guards/public-key.guard';
import { PublicApi } from './public-shop.controller';

class PublicPaymentMethodsDto extends createZodDto(
  z.object({
    methods: z.array(
      z.object({
        method: z.nativeEnum(PaymentMethod),
        kind: z.nativeEnum(PaymentMethodKind),
        accountName: z.string(),
        number: z.string().nullable(),
        accountType: z.nativeEnum(WalletAccountType).nullable(),
        note: z.string().nullable(),
        bank: z
          .object({
            bankName: z.string(),
            accountNumber: z.string(),
            branch: z.string().nullable(),
            routingNumber: z.string().nullable(),
            swiftCode: z.string().nullable(),
            instructions: z.string().nullable(),
          })
          .nullable(),
      }),
    ),
  }),
) {}

// WAL-06, SFT-10 (Phase 5 Slice 5.1): the methods a shopper may pay the key's shop by -- each that is on, with its
// active account only, never an inactive one; none until the owner's phone is verified (TVR-01). Never cached, so a
// method switched off leaves checkout at once.
@ApiTags('Public API')
@Controller('public/payment-methods')
@PublicApi()
export class PublicPaymentMethodsController {
  constructor(@Inject(PaymentMethods) private readonly methods: PaymentMethods) {}

  @Get()
  @ResponseMessage('PaymentMethodsRetrieved')
  @ApiOperation({
    summary:
      "The shop's payment methods that are on, each with its active account, for checkout (WAL-06, SFT-10)",
  })
  @ZodResponse({ type: PublicPaymentMethodsDto })
  async list(@Req() request: PublicApiRequest): Promise<{ methods: ShopperPaymentMethod[] }> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the public key guard names the shop');
    return { methods: await this.methods.forShoppers(shop.row.id) };
  }
}

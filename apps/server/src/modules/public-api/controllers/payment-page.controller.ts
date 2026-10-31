import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import {
  PaymentMethod,
  PaymentMethodKind,
  PaymentSessionState,
  paymentSubmissionSchema,
  WalletAccountType,
  type PaymentSubmissionInput,
} from '@lytronix/validators';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { MediaService } from '../../media/services/media.service';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import type { PaymentPageSession } from '../../payment-sessions/types/payment-sessions';
import { PaymentPageGuard } from '../guards/payment-page.guard';
import type { PublicApiRequest } from '../guards/public-key.guard';
import { API_CLOCK } from '../tokens';

/** PAY-05: the page as it is shown -- the shop's name and logo beside the session. */
type PaymentPageView = PaymentPageSession & {
  shop: { name: string; logo: { id: string; urls: { main: string; thumbnail: string } } | null };
};

class PaymentSubmissionDto extends createZodDto(paymentSubmissionSchema) {}
class PaymentPageDto extends createZodDto(
  z.object({
    shop: z.object({
      name: z.string(),
      logo: z
        .object({ id: z.string(), urls: z.object({ main: z.string(), thumbnail: z.string() }) })
        .nullable(),
    }),
    orderNumber: z.string(),
    amount: z.string(),
    state: z.nativeEnum(PaymentSessionState),
    expiresAt: z.coerce.date(),
    method: z.nativeEnum(PaymentMethod).nullable(),
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
    returnUrl: z.string().nullable(),
    cancelUrl: z.string().nullable(),
    submitted: z
      .object({
        method: z.nativeEnum(PaymentMethod),
        transactionId: z.string(),
        senderNumber: z.string().nullable(),
        submittedAt: z.coerce.date(),
      })
      .nullable(),
  }),
) {}

// PAY-03 to PAY-08, PAY-16, PAY-17 (Phase 5 Slice 5.2, read agreed 2026-10-31): the payment page's own routes, on the
// API host at /v1/pay/<reference>, for the page at pay.<domain> to read and to send what the shopper typed. No key:
// the session's unguessable reference is the page's own (payment-page.guard.ts).
@ApiTags('Public API')
@Controller('public/pay')
@PublicApiRoute()
@UseGuards(PaymentPageGuard)
export class PaymentPageController {
  constructor(
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(API_CLOCK) private readonly clock: () => Date,
  ) {}

  @Get(':ref')
  @ResponseMessage('PaymentPageRetrieved')
  @ApiOperation({
    summary:
      "A payment page: the shop, the order's amount, its state and the methods to pay by, each with its active account (PAY-05, PAY-17)",
  })
  @ZodResponse({ type: PaymentPageDto })
  async page(
    @Param('ref') ref: string,
    @Req() request: PublicApiRequest,
  ): Promise<PaymentPageView> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the payment page guard names the shop');
    const session = await this.sessions.page(shop.row.id, ref, this.clock());
    return { ...session, shop: await this.shopOf(shop.row.id, shop.row.shopName) };
  }

  @Post(':ref/transaction')
  @ResponseMessage('PaymentSubmitted')
  @ApiOperation({
    summary:
      'What the shopper typed: the method, the transaction ID and the number it came from; the payment is then checked (PAY-07, PAY-16)',
  })
  @ApiBody({ type: PaymentSubmissionDto })
  @ZodResponse({ type: PaymentPageDto })
  async submit(
    @Param('ref') ref: string,
    @Body(new ZodValidationPipe(PaymentSubmissionDto.schema)) body: PaymentSubmissionInput,
    @Req() request: PublicApiRequest,
  ): Promise<PaymentPageView> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the payment page guard names the shop');
    const session = await this.sessions.submit(shop.row.id, ref, body, this.clock());
    return { ...session, shop: await this.shopOf(shop.row.id, shop.row.shopName) };
  }

  /** PAY-05, TEN-16: the shop's name and logo, nothing else of its brand (BRN-04). */
  private async shopOf(tenantId: string, name: string): Promise<PaymentPageView['shop']> {
    return { name, logo: await this.media.logoOf(tenantId) };
  }
}

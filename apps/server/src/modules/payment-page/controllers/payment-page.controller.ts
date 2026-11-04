import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import {
  gatewayCheckoutSchema,
  GatewayResult,
  paymentIdChangeSchema,
  PaymentMethod,
  PaymentMethodKind,
  paymentPageReportSchema,
  PaymentPageReviewReason,
  PaymentRejectReason,
  PaymentSessionSource,
  PaymentSessionState,
  paymentSubmissionSchema,
  WalletAccountType,
  PaymentWay,
  type GatewayCheckoutInput,
  type PaymentIdChangeInput,
  type PaymentPageReportInput,
  type PaymentSubmissionInput,
} from '@lytronix/validators';
import { ClientIp } from '../../../common/client-ip';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { OkDto } from '../../../common/dto/ok.dto';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { GatewayCheckouts, type StartedCheckout } from '../../gateway/services/gateway-checkout';
import { PAYMENT_PAGE_ORIGIN } from '../../payment-sessions/tokens';
import { PaymentSubmissions } from '../../listener-receipts/services/payment-submissions';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import type { PaymentPageSession } from '../../payment-sessions/types/payment-sessions';
import type { PublicApiRequest } from '../../public-api/guards/public-key.guard';
import { API_CLOCK } from '../../public-api/tokens';
import { PaymentPageGuard } from '../guards/payment-page.guard';
import { PaymentPageReader, type PaymentPageShop } from '../services/payment-page-reader';

/** VER-08: the one route here that answers with an address rather than the envelope. */
interface RedirectingResponse {
  redirect(status: number, url: string): void;
}

/** PAY-05: the page as it is shown -- the shop's name and logo beside the session. */
type PaymentPageView = PaymentPageSession & { shop: PaymentPageShop };

class PaymentSubmissionDto extends createZodDto(paymentSubmissionSchema) {}
class PaymentIdChangeDto extends createZodDto(paymentIdChangeSchema) {}
class GatewayCheckoutDto extends createZodDto(gatewayCheckoutSchema) {}
class GatewayCheckoutStartedDto extends createZodDto(
  z.object({ redirectUrl: z.string().nullable() }),
) {}
class PaymentPageReportDto extends createZodDto(paymentPageReportSchema) {}
class PaymentPageDto extends createZodDto(
  z.object({
    shop: z.object({
      name: z.string(),
      logo: z
        .object({ id: z.string(), urls: z.object({ main: z.string(), thumbnail: z.string() }) })
        .nullable(),
      contactPhone: z.string().nullable(),
    }),
    orderNumber: z.string(),
    trackingId: z.string(),
    items: z.array(
      z.object({ name: z.string(), attributes: z.array(z.string()), quantity: z.string() }),
    ),
    source: z.nativeEnum(PaymentSessionSource),
    amount: z.string(),
    state: z.nativeEnum(PaymentSessionState),
    expiresAt: z.coerce.date(),
    method: z.nativeEnum(PaymentMethod).nullable(),
    methods: z.array(
      z.object({
        method: z.nativeEnum(PaymentMethod),
        kind: z.nativeEnum(PaymentMethodKind),
        way: z.nativeEnum(PaymentWay),
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
    rejected: z
      .object({ reason: z.nativeEnum(PaymentRejectReason), note: z.string().nullable() })
      .nullable(),
    review: z.object({ reason: z.nativeEnum(PaymentPageReviewReason) }).nullable(),
    listenerOnline: z.boolean(),
    idChangesLeft: z.number(),
    gatewayResult: z.nativeEnum(GatewayResult).nullable(),
    test: z.boolean(),
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

// PAY-03 to PAY-08, PAY-16, PAY-17, TVR-02 (Phase 5 Slice 5.2, read agreed 2026-10-31): the payment page's own routes,
// on the API host at /v1/pay/<reference>, for the page at pay.<domain> to read, to send what the shopper typed, and to
// report the page to Lytro. No key: the session's unguessable reference is the page's own (payment-page.guard.ts).
@ApiTags('Public API')
@Controller('public/pay')
@PublicApiRoute()
@UseGuards(PaymentPageGuard)
export class PaymentPageController {
  constructor(
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(PaymentSubmissions) private readonly submissions: PaymentSubmissions,
    @Inject(PaymentPageReader) private readonly reader: PaymentPageReader,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
    @Inject(API_CLOCK) private readonly clock: () => Date,
    @Inject(GatewayCheckouts) private readonly checkouts: GatewayCheckouts,
    @Inject(PAYMENT_PAGE_ORIGIN) private readonly pageOrigin: string,
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
    const session = await this.submissions.submit(shop.row.id, ref, body, this.clock());
    return { ...session, shop: await this.shopOf(shop.row.id, shop.row.shopName) };
  }

  @Patch(':ref/transaction')
  @ResponseMessage('PaymentIdChanged')
  @ApiOperation({
    summary:
      'The shopper corrects the transaction ID they typed, up to 3 times, until someone decides (PAY-07, agreed 2026-11-02)',
  })
  @ApiBody({ type: PaymentIdChangeDto })
  @ZodResponse({ type: PaymentPageDto })
  async change(
    @Param('ref') ref: string,
    @Body(new ZodValidationPipe(PaymentIdChangeDto.schema)) body: PaymentIdChangeInput,
    @Req() request: PublicApiRequest,
  ): Promise<PaymentPageView> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the payment page guard names the shop');
    const session = await this.submissions.change(
      shop.row.id,
      ref,
      body,
      this.clientIp.resolve(request),
      this.clock(),
    );
    return { ...session, shop: await this.shopOf(shop.row.id, shop.row.shopName) };
  }

  @Post(':ref/checkout')
  @HttpCode(200)
  @ResponseMessage('GatewayCheckoutStarted')
  @ApiOperation({
    summary:
      "The shopper picks a wallet whose shop takes its money through the wallet's own checkout: where to send them, or null to pay on the page instead (PAY-06, agreed 2026-11-03)",
  })
  @ApiBody({ type: GatewayCheckoutDto })
  @ZodResponse({ type: GatewayCheckoutStartedDto })
  checkout(
    @Param('ref') ref: string,
    @Body(new ZodValidationPipe(GatewayCheckoutDto.schema)) body: GatewayCheckoutInput,
    @Req() request: PublicApiRequest,
  ): Promise<StartedCheckout> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the payment page guard names the shop');
    return this.checkouts.start(shop.row.id, ref, body.method);
  }

  @Get(':ref/gateway-return')
  @ApiOperation({
    summary:
      "Where the wallet returns the shopper. It proves nothing: the payment is settled only by the gateway's own answer, then the shopper goes back to the page (VER-08, VER-09)",
  })
  async gatewayReturn(
    @Param('ref') ref: string,
    @Query('paymentID') paymentId: string | undefined,
    @Query('status') status: string | undefined,
    @Req() request: PublicApiRequest,
    @Res() response: RedirectingResponse,
  ): Promise<void> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the payment page guard names the shop');
    await this.checkouts.returned(shop.row.id, ref, { paymentId, status });
    // Back from paying: the page returns to the shop if it went through, and offers another try if it didn't.
    response.redirect(302, `${this.pageOrigin}/${ref}?just=1`);
  }

  @Post(':ref/report')
  @ResponseMessage('PaymentPageReported')
  @ApiOperation({
    summary:
      'Report this page to Lytro: asked for a PIN or code, not the shop ordered from, the wrong amount, or something else with a note; 5 an hour from one visitor (TVR-02)',
  })
  @ApiBody({ type: PaymentPageReportDto })
  @ZodResponse({ type: OkDto })
  async report(
    @Param('ref') ref: string,
    @Body(new ZodValidationPipe(PaymentPageReportDto.schema)) body: PaymentPageReportInput,
    @Req() request: PublicApiRequest,
  ): Promise<{ ok: true }> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the payment page guard names the shop');
    await this.sessions.report(
      shop.row.id,
      ref,
      body,
      this.clientIp.resolve(request),
      this.clock(),
    );
    return { ok: true };
  }

  private shopOf(tenantId: string, name: string): Promise<PaymentPageShop> {
    return this.reader.shopOf(tenantId, name);
  }
}

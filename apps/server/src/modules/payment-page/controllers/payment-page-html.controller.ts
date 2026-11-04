import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  paymentIdChangeSchema,
  paymentPageReportSchema,
  paymentSubmissionSchema,
  PaymentPageReportReason,
  ServerFieldProblemCode,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { GatewayCheckouts } from '../../gateway/services/gateway-checkout';
import { PaymentSubmissions } from '../../listener-receipts/services/payment-submissions';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import type { PublicApiRequest } from '../../public-api/guards/public-key.guard';
import { API_CLOCK } from '../../public-api/tokens';
import { PaymentPageErrors } from '../filters/payment-page-errors.filter';
import { PaymentPageGuard } from '../guards/payment-page.guard';
import { PaymentPageHostGuard } from '../guards/payment-page-host.guard';
import { askOf, languageOf, methodOf, pageAddress, pageHeaders } from '../page/ask';
import {
  drawHandOver,
  drawPage,
  type DrawOptions,
  type TypedForm,
  type TypedReport,
} from '../page/render';
import { screenOf, type PageAsk } from '../page/screens';
import { PaymentPageAssets } from '../services/payment-page-assets';
import { PaymentPageReader } from '../services/payment-page-reader';
import { PAY_PAGE_MEDIA_ORIGIN } from '../tokens';

interface PageResponse {
  status(code: number): PageResponse;
  set(headers: Record<string, string>): PageResponse;
  send(body: string): unknown;
  redirect(status: number, url: string): void;
}

type Form = Readonly<Record<string, unknown>>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const NOTHING_ASKED: PageAsk = {
  language: 'bn',
  wallet: null,
  pick: false,
  hand: false,
  change: false,
  just: false,
  reported: false,
};

/** Which field a validator refused, for the page to word it. */
function problemOfField(field: unknown): TypedForm['problem'] {
  return field === 'senderNumber' ? 'sender' : 'shape';
}

/**
 * PAY-01, PAY-05 to PAY-08, PAY-17, PAY-23, TVR-02 (Slice 5.8's part 2, read agreed 2026-11-04): the payment page itself, at
 * pay.<domain>/<reference>, drawn by the server. Its forms post here and it answers with a page, so a phone that can't run
 * the page's script can still pay. The session's reference opens it, as it does the API's read of it (payment-page.guard).
 */
@ApiExcludeController()
@Controller('pay-page')
@SkipTenant()
@UseFilters(PaymentPageErrors)
@UseGuards(PaymentPageHostGuard, PaymentPageGuard)
export class PaymentPageHtmlController {
  constructor(
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(PaymentSubmissions) private readonly submissions: PaymentSubmissions,
    @Inject(GatewayCheckouts) private readonly checkouts: GatewayCheckouts,
    @Inject(PaymentPageReader) private readonly reader: PaymentPageReader,
    @Inject(PaymentPageAssets) private readonly assets: PaymentPageAssets,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
    @Inject(API_CLOCK) private readonly clock: () => Date,
    @Inject(PAY_PAGE_MEDIA_ORIGIN) private readonly mediaOrigin: string | undefined,
  ) {}

  @Get(':ref')
  async page(
    @Param('ref') ref: string,
    @Query() query: Form,
    @Req() request: PublicApiRequest,
    @Res() response: PageResponse,
  ): Promise<void> {
    await this.draw(ref, askOf(query), request, response);
  }

  /** PAY-17: what the page would draw now, for it to reload once that changes. */
  @Get(':ref/status')
  async status(
    @Param('ref') ref: string,
    @Query() query: Form,
    @Req() request: PublicApiRequest,
    @Res() response: PageResponse,
  ): Promise<void> {
    const shop = this.shopOf(request);
    const now = this.clock();
    const session = await this.sessions.page(shop.id, ref, now);
    const data = await this.reader.dataOf(shop, ref, session);
    response
      .status(200)
      .set({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .send(JSON.stringify({ screen: screenOf(data, askOf(query), now) }));
  }

  /** PAY-07, PAY-16: what the shopper typed. What was wrong with it is said on the same screen, with it still typed. */
  @Post(':ref/transaction')
  async submit(
    @Param('ref') ref: string,
    @Body() body: Form,
    @Req() request: PublicApiRequest,
    @Res() response: PageResponse,
  ): Promise<void> {
    const shop = this.shopOf(request);
    const language = languageOf(body['lang']);
    const method = methodOf(body['method']);
    const transactionId = text(body['transactionId']);
    const senderNumber = text(body['senderNumber']);
    if (method === null) {
      response.redirect(303, pageAddress(ref, language));
      return;
    }
    const ask: PageAsk = { ...NOTHING_ASKED, language, wallet: method, hand: true };
    const parsed = paymentSubmissionSchema.safeParse({
      method,
      transactionId,
      ...(senderNumber === '' ? {} : { senderNumber }),
    });
    if (!parsed.success) {
      const problem = problemOfField(parsed.error.issues[0]?.path[0]);
      await this.draw(
        ref,
        ask,
        request,
        response,
        { typed: { transactionId, senderNumber, problem } },
        422,
      );
      return;
    }
    await this.typing(ref, ask, { transactionId, senderNumber }, request, response, () =>
      this.submissions.submit(shop.id, ref, parsed.data, this.clock()),
    );
  }

  /** PAY-07 (agreed 2026-11-02): the shopper corrects the ID they typed. */
  @Post(':ref/change')
  async change(
    @Param('ref') ref: string,
    @Body() body: Form,
    @Req() request: PublicApiRequest,
    @Res() response: PageResponse,
  ): Promise<void> {
    const shop = this.shopOf(request);
    const language = languageOf(body['lang']);
    const transactionId = text(body['transactionId']);
    const senderNumber = text(body['senderNumber']);
    const ask: PageAsk = { ...NOTHING_ASKED, language, change: true };
    const parsed = paymentIdChangeSchema.safeParse({
      transactionId,
      ...(senderNumber === '' ? {} : { senderNumber }),
    });
    if (!parsed.success) {
      const problem = problemOfField(parsed.error.issues[0]?.path[0]);
      await this.draw(
        ref,
        ask,
        request,
        response,
        { typed: { transactionId, senderNumber, problem } },
        422,
      );
      return;
    }
    await this.typing(ref, ask, { transactionId, senderNumber }, request, response, () =>
      this.submissions.change(
        shop.id,
        ref,
        parsed.data,
        this.clientIp.resolve(request),
        this.clock(),
      ),
    );
  }

  /** PAY-06: on to the wallet's own checkout, or on with paying here when there is nowhere to send them. */
  @Post(':ref/checkout')
  async checkout(
    @Param('ref') ref: string,
    @Body() body: Form,
    @Req() request: PublicApiRequest,
    @Res() response: PageResponse,
  ): Promise<void> {
    const shop = this.shopOf(request);
    const language = languageOf(body['lang']);
    const method = methodOf(body['method']);
    if (method === null) {
      response.redirect(303, pageAddress(ref, language));
      return;
    }
    try {
      const { redirectUrl } = await this.checkouts.start(shop.id, ref, method);
      if (redirectUrl === null) {
        response.redirect(303, pageAddress(ref, language, { w: method, hand: '1' }));
        return;
      }
      this.send(response, 200, drawHandOver(redirectUrl, method, language, this.assets.urls));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'conflict') {
        response.redirect(303, pageAddress(ref, language));
        return;
      }
      throw error;
    }
  }

  /** TVR-02: "Report this page", for Lytro to look at. A note left out opens the sheet again, with what was chosen. */
  @Post(':ref/report')
  async report(
    @Param('ref') ref: string,
    @Body() body: Form,
    @Req() request: PublicApiRequest,
    @Res() response: PageResponse,
  ): Promise<void> {
    const shop = this.shopOf(request);
    const language = languageOf(body['lang']);
    const note = text(body['note']);
    const parsed = paymentPageReportSchema.safeParse({
      reason: body['reason'],
      ...(note === '' ? {} : { note }),
    });
    if (!parsed.success) {
      const typedReport: TypedReport = {
        reason:
          Object.values(PaymentPageReportReason).find((reason) => reason === body['reason']) ??
          PaymentPageReportReason.Other,
        note,
      };
      await this.draw(ref, { ...NOTHING_ASKED, language }, request, response, { typedReport }, 422);
      return;
    }
    await this.sessions.report(
      shop.id,
      ref,
      parsed.data,
      this.clientIp.resolve(request),
      this.clock(),
    );
    response.redirect(303, pageAddress(ref, language, { reported: '1' }));
  }

  private shopOf(request: PublicApiRequest): { id: string; shopName: string; slug: string } {
    const shop = request.apiShop;
    if (!shop) throw new Error('the payment page guard names the shop');
    return shop.row;
  }

  /** A typed ID taken, one already held refused on the same screen, or the session closed meanwhile: what it now is. */
  private async typing(
    ref: string,
    ask: PageAsk,
    typed: Pick<TypedForm, 'transactionId' | 'senderNumber'>,
    request: PublicApiRequest,
    response: PageResponse,
    take: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await take();
      response.redirect(303, pageAddress(ref, ask.language, { just: '1' }));
    } catch (error) {
      if (
        error instanceof FieldsError &&
        error.fields.some((row) => row.field === 'transactionId')
      ) {
        const used = error.fields.some((row) => row.problem === ServerFieldProblemCode.AlreadyUsed);
        await this.draw(
          ref,
          ask,
          request,
          response,
          { typed: { ...typed, problem: used ? 'used' : 'shape' } },
          used ? 409 : 422,
        );
        return;
      }
      if (
        error instanceof ApiError &&
        (error.code === 'conflict' || error instanceof FieldsError)
      ) {
        response.redirect(303, pageAddress(ref, ask.language));
        return;
      }
      throw error;
    }
  }

  private async draw(
    ref: string,
    ask: PageAsk,
    request: PublicApiRequest,
    response: PageResponse,
    options: DrawOptions = {},
    status = 200,
  ): Promise<void> {
    const shop = this.shopOf(request);
    const now = this.clock();
    const session = await this.sessions.page(shop.id, ref, now);
    const data = await this.reader.dataOf(shop, ref, session);
    this.send(response, status, drawPage(data, ask, now, this.assets.urls, options));
  }

  private send(response: PageResponse, status: number, page: string): void {
    response.status(status).set(pageHeaders(this.mediaOrigin)).send(page);
  }
}

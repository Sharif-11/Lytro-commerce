import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import type { HttpRequest, HttpResponse } from '../../../common/http';
import type { MessageHeaders } from '../ports/courier-adapter';
import { CourierMessages } from '../services/courier-messages';
import { CourierNewsPath } from '../services/courier-news-path';

// CRR-11, CRR-27 (Phase 6 Slice 6.2): where couriers send their messages. Only the address's own token finds a shop, so there is no
// session, and the raw body is what the courier's signature is over. The courier has its answer before the news is applied.
// Served on the API host at /v1/webhooks/couriers/<token>, as every call from another service is (fixed 2026-11-10: the edge
// only ever forwarded /v1/ there, so the old /api/v1 address never reached the server). No key: the token is the proof.
@ApiTags('Couriers')
@Controller('public/webhooks/couriers')
@PublicApiRoute()
@SkipTenant()
export class CourierMessagesController {
  private readonly logger = new Logger('CourierMessages');

  constructor(
    @Inject(CourierMessages) private readonly messages: CourierMessages,
    @Inject(CourierNewsPath) private readonly news: CourierNewsPath,
  ) {}

  // CRR-27: 202 for every courier: Pathao requires it, Steadfast takes any 2xx, and it says what happened: stored, to be applied.
  @Post(':token')
  @HttpCode(202)
  @ResponseMessage('Success')
  @ApiOperation({
    summary:
      "A courier's message: its address finds the shop, its proof is checked, and it is stored and answered at once, then applied (CRR-11 to CRR-13, CRR-27)",
  })
  @ZodResponse({ type: OkDto })
  async receive(
    @Param('token') token: string,
    @Req() request: RawBodyRequest<HttpRequest>,
    @Headers() headers: MessageHeaders,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<{ ok: true }> {
    const received = await this.messages.receive(
      token,
      request.rawBody ?? Buffer.alloc(0),
      headers,
    );
    const { stored, tenantId, answerHeaders } = received;
    for (const [name, value] of Object.entries(answerHeaders)) response.setHeader(name, value);
    if (stored !== null && tenantId !== null) {
      // After the answer: if the server stops first, the minute pass applies what was stored.
      setImmediate(() => {
        this.news.apply(tenantId, stored).catch((error: unknown) => {
          this.logger.error('a stored courier message could not be applied', error as Error);
        });
      });
    }
    return { ok: true };
  }
}

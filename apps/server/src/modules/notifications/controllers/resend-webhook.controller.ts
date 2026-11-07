import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import type { HttpRequest } from '../../../common/http';
import { ResendWebhook } from '../../shared/mail/services/resend-webhook';
import type { SvixHeaders } from '../../shared/mail/services/svix-signature';
import { BounceNotices } from '../services/bounce-notices';

// NTF-06 (Phase 7 Slice 7.3): where Resend says an email bounced or was marked as spam. There is no session and no shop:
// the signature over the raw body is the only proof, and an unsigned message is refused. Each owner whose address it
// stopped is told in the bell and by push (D7-38).
@ApiTags('Email')
@Controller('webhooks/email')
@SkipTenant()
export class ResendWebhookController {
  constructor(
    @Inject(ResendWebhook) private readonly webhook: ResendWebhook,
    @Inject(BounceNotices) private readonly bounces: BounceNotices,
  ) {}

  @Post('resend')
  @HttpCode(200)
  @ResponseMessage('Success')
  @ApiOperation({
    summary:
      "Resend's word that an email bounced for good or was marked as spam: the address is no longer emailed (NTF-06)",
  })
  @ZodResponse({ type: OkDto })
  async receive(
    @Req() request: RawBodyRequest<HttpRequest>,
    @Headers() headers: SvixHeaders,
  ): Promise<{ ok: true }> {
    const stopped = await this.webhook.receive(request.rawBody ?? Buffer.alloc(0), headers);
    await this.bounces.tell(stopped);
    return { ok: true };
  }
}

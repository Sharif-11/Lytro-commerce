import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import type { OauthProvider } from '@lytronix/validators';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ClientIp } from '../../../common/client-ip';
import { type HttpRequest, type HttpResponse } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { OauthCallbackDto } from '../dto/auth.dto';
import { OauthService, type OauthAttached, type OauthSignedIn } from '../services/oauth.service';

// Google and Facebook sign-in routes (AUTH-24). A provider that is switched off has no routes: it answers 404.
@Controller('auth')
@SkipTenant()
export class OauthController {
  constructor(
    @Inject(OauthService) private readonly oauth: OauthService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get('providers')
  providers(): { providers: OauthProvider[] } {
    return { providers: this.oauth.enabledProviders() };
  }

  @Get('oauth/:provider/start')
  start(@Param('provider') provider: string): Promise<{ url: string }> {
    return this.oauth.start(provider);
  }

  @Get('oauth/:provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query(new ZodValidationPipe(OauthCallbackDto.schema)) query: OauthCallbackDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<Omit<OauthSignedIn, 'cookie'> | OauthAttached> {
    const result = await this.oauth.callback(
      provider,
      query.code,
      query.state,
      this.clientIp.context(request),
    );
    if (isAttached(result)) return result;
    response.setHeader('Set-Cookie', result.cookie);
    return {
      next: result.next,
      tenantId: result.tenantId,
      csrfToken: result.csrfToken,
      recovery: result.recovery,
    };
  }
}

function isAttached(result: OauthSignedIn | OauthAttached): result is OauthAttached {
  return 'attached' in result;
}

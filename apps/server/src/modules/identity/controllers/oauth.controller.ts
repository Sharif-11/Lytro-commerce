import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { OauthProvider } from '@lytronix/validators';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ClientIp } from '../../../common/client-ip';
import { type HttpRequest, type HttpResponse } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { OauthCallbackDto } from '../dto/auth.dto';
import { OauthProvidersDto, OauthUrlDto } from '../dto/identities-response.dto';
import { OauthService } from '../services/oauth.service';
import type { OauthAttached, OauthSignedIn } from '../types/oauth';

// Google and Facebook sign-in routes (AUTH-24). A provider that is switched off has no routes: it answers 404.
@ApiTags('Oauth')
@Controller('auth')
@SkipTenant()
export class OauthController {
  constructor(
    @Inject(OauthService) private readonly oauth: OauthService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get('providers')
  @ResponseMessage('OauthProvidersListed')
  @ApiOperation({ summary: 'List the enabled OAuth providers' })
  @ZodResponse({ type: OauthProvidersDto })
  providers(): { providers: OauthProvider[] } {
    return { providers: this.oauth.enabledProviders() };
  }

  @Get('oauth/:provider/start')
  @ResponseMessage('OauthRedirectReady')
  @ApiOperation({ summary: 'Get the OAuth provider redirect URL' })
  @ZodResponse({ type: OauthUrlDto })
  start(@Param('provider') provider: string): Promise<{ url: string }> {
    return this.oauth.start(provider);
  }

  @Get('oauth/:provider/callback')
  @ResponseMessage('SignedIn')
  @ApiOperation({
    summary: 'Handle the OAuth provider callback',
    description:
      'Returns a sign-in body ({ next, tenantId, csrfToken, recovery }) for a normal sign-in, or an ' +
      'OauthAttached body ({ attached }) when this call instead attached a provider to an already ' +
      'signed-in account.',
  })
  @ApiQuery({ name: 'code', required: true, type: String })
  @ApiQuery({ name: 'state', required: true, type: String })
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
    if (this.isAttached(result)) return result;
    response.setHeader('Set-Cookie', result.cookie);
    return {
      next: result.next,
      tenantId: result.tenantId,
      csrfToken: result.csrfToken,
      recovery: result.recovery,
    };
  }

  private isAttached(result: OauthSignedIn | OauthAttached): result is OauthAttached {
    return 'attached' in result;
  }
}

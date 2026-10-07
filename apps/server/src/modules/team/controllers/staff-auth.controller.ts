import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ClientIp } from '../../../common/client-ip';
import { headerValue, type HttpRequest, type HttpResponse } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { PasswordSigninDto } from '../../identity/dto/auth.dto';
import { TenantResolver } from '../../tenancy/services/tenant-resolver.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import { StaffSigninService } from '../services/staff-signin.service';

// Staff sign-in is only meaningful on a shop's own host, so the shop comes from the host (TEN-28).
@Controller('auth/staff')
export class StaffAuthController {
  constructor(
    @Inject(StaffSigninService) private readonly signin: StaffSigninService,
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(TenantSummaries) private readonly summaries: TenantSummaries,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Post('signin')
  @HttpCode(200)
  async signIn(
    @Body(new ZodValidationPipe(PasswordSigninDto.schema)) body: PasswordSigninDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<{ next: string; tenantId: string | null; csrfToken: string }> {
    const resolved = await this.resolver.resolve(headerValue(request.headers.host));
    if (resolved.outcome === 'not_found') throw new NotFoundException('Page not found.');
    const shop = await this.summaries.findById(resolved.tenant.id);
    if (!shop) throw new NotFoundException('Page not found.');
    const result = await this.signin.signIn(
      shop,
      body.phone,
      body.password,
      this.clientIp.context(request),
    );
    response.setHeader('Set-Cookie', result.cookie);
    return { next: result.next, tenantId: result.tenantId, csrfToken: result.csrfToken };
  }
}

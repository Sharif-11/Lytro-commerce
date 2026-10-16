import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AllowPendingPassword } from '../../../common/decorators/allow-pending-password';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { headerValue, type HttpRequest, type HttpResponse } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { PasswordSigninDto } from '../../identity/dto/auth.dto';
import { SignedInBodyDto } from '../../identity/dto/auth-response.dto';
import type { NextStep } from '../../identity/types/signed-in';
import { SessionGuard, type SessionRequest } from '../../identity/guards/session.guard';
import { ChangeStaffPasswordDto } from '../dto/staff.dto';
import { TenantResolver } from '../../tenancy/services/tenant-resolver.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import { StaffSigninService } from '../services/staff-signin.service';

// Staff sign-in is only meaningful on a shop's own host, so the shop comes from the host (TEN-28).
@ApiTags('Staff Auth')
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
  @ResponseMessage('SignedIn')
  @ApiOperation({ summary: "Staff sign-in, on the shop's own host" })
  @ApiBody({ type: PasswordSigninDto })
  @ZodResponse({ type: SignedInBodyDto })
  async signIn(
    @Body(new ZodValidationPipe(PasswordSigninDto.schema)) body: PasswordSigninDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<{ next: NextStep; tenantId: string | null; csrfToken: string }> {
    const resolved = await this.resolver.resolve(headerValue(request.headers.host));
    if (resolved.outcome === 'not_found') throw new ApiError('not_found', 'PageNotFound', {});
    const shop = await this.summaries.findById(resolved.tenant.id);
    if (!shop) throw new ApiError('not_found', 'PageNotFound', {});
    const result = await this.signin.signIn(
      shop,
      body.phone,
      body.password,
      this.clientIp.context(request),
    );
    response.setHeader('Set-Cookie', result.cookie);
    return { next: result.next, tenantId: result.tenantId, csrfToken: result.csrfToken };
  }

  // A staff member changes their own password. The route stays open while the owner's forced change is pending (STF-13).
  @Post('password')
  @HttpCode(200)
  @AllowPendingPassword()
  @UseGuards(SessionGuard)
  @ResponseMessage('PasswordChanged')
  @ApiOperation({ summary: 'A staff member changes their own password' })
  @ApiBody({ type: ChangeStaffPasswordDto })
  @ZodResponse({ type: OkDto })
  async changePassword(
    @Body(new ZodValidationPipe(ChangeStaffPasswordDto.schema)) body: ChangeStaffPasswordDto,
    @Req() request: SessionRequest & HttpRequest,
  ): Promise<{ ok: true }> {
    const session = request.session;
    if (!session || session.userId === null || session.tenantId === null) {
      throw new ApiError('forbidden', 'StaffPasswordChangeWrongPath', {});
    }
    await this.signin.changeOwnPassword(session, body, this.clientIp.resolve(request));
    return { ok: true };
  }
}

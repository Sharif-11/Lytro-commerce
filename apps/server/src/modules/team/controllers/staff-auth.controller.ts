import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AllowPendingPassword } from '../../../common/decorators/allow-pending-password';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { OkDto } from '../../../common/dto/ok.dto';
import type { HttpRequest, HttpResponse } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { PasswordSigninDto } from '../../identity/dto/auth.dto';
import { SignedInBodyDto } from '../../identity/dto/auth-response.dto';
import type { NextStep } from '../../identity/types/signed-in';
import { SessionGuard, type SessionRequest } from '../../identity/guards/session.guard';
import { ChangeStaffPasswordDto } from '../dto/staff.dto';
import { StaffSigninService } from '../services/staff-signin.service';

// AUTH-31: staff sign in at app.lytro.app/staff-sign-in; the phone finds their shop, never the request host.
@ApiTags('Staff Auth')
@Controller('auth/staff')
@SkipTenant()
export class StaffAuthController {
  constructor(
    @Inject(StaffSigninService) private readonly signin: StaffSigninService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Post('signin')
  @HttpCode(200)
  @ResponseMessage('SignedIn')
  @ApiOperation({ summary: 'Staff sign-in, with the phone and the password the owner set' })
  @ApiBody({ type: PasswordSigninDto })
  @ZodResponse({ type: SignedInBodyDto })
  async signIn(
    @Body(new ZodValidationPipe(PasswordSigninDto.schema)) body: PasswordSigninDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<{ next: NextStep; tenantId: string | null; csrfToken: string }> {
    const result = await this.signin.signIn(
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

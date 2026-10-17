import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ClientIp } from '../../../common/client-ip';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { type HttpRequest, type HttpResponse } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  operatorEnrollSchema,
  operatorRegenerateBackupCodesSchema,
  operatorSigninSchema,
  operatorVerifySchema,
} from '@lytronix/validators';
import {
  OperatorEnrollDto,
  OperatorRegenerateBackupCodesDto,
  OperatorSigninDto,
  OperatorVerifyDto,
} from '../dto/operator-auth.dto';
import {
  OperatorBackupCodesDto,
  OperatorEnrolledDto,
  OperatorSignedInDto,
} from '../dto/operator-auth-response.dto';
import { OperatorSessionGuard } from '../guards/operator-session.guard';
import { OperatorAuthService } from '../services/operator-auth.service';
import type { OperatorSessionRecord } from '../ports/operator-gateway';
import type { OperatorSigninResult } from '../types/session';

interface OperatorSignedInBody {
  csrfToken: string;
}

// ADM-01, D8: the operator console's own sign-in, separate from the tenant dashboard's (/auth). A tenant
// credential has no account here and vice versa.
@ApiTags('Operator Auth')
@Controller('auth/operator')
@SkipTenant()
export class OperatorAuthController {
  constructor(
    @Inject(OperatorAuthService) private readonly operators: OperatorAuthService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Post('signin')
  @HttpCode(200)
  @ResponseMessage('OperatorCredentialsAccepted')
  @ApiOperation({
    summary: 'Operator sign-in, first factor (email and password)',
    description:
      "Returns { next: 'enroll-2fa', secret, uri } the first time, to show a QR code, or " +
      "{ next: 'verify-2fa' } once enrolled, to prompt for a TOTP or backup code.",
  })
  @ApiBody({ type: OperatorSigninDto })
  signin(
    @Body(new ZodValidationPipe(operatorSigninSchema)) body: OperatorSigninDto,
  ): Promise<OperatorSigninResult> {
    return this.operators.signin(body.email, body.password);
  }

  @Post('enroll')
  @HttpCode(200)
  @ResponseMessage('TwoFactorEnrolled')
  @ApiOperation({ summary: 'Confirm 2FA enrollment with the first TOTP code' })
  @ApiBody({ type: OperatorEnrollDto })
  @ZodResponse({ type: OperatorEnrolledDto })
  async enroll(
    @Body(new ZodValidationPipe(operatorEnrollSchema)) body: OperatorEnrollDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<OperatorSignedInBody & { backupCodes: string[] }> {
    const result = await this.operators.enroll(
      body.email,
      body.password,
      body.code,
      this.clientIp.context(request),
    );
    response.setHeader('Set-Cookie', result.cookie);
    return { csrfToken: result.csrfToken, backupCodes: result.backupCodes };
  }

  @Post('verify')
  @HttpCode(200)
  @ResponseMessage('OperatorVerified')
  @ApiOperation({ summary: 'Operator sign-in, second factor (TOTP or backup code)' })
  @ApiBody({ type: OperatorVerifyDto })
  @ZodResponse({ type: OperatorSignedInDto })
  async verify(
    @Body(new ZodValidationPipe(operatorVerifySchema)) body: OperatorVerifyDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<OperatorSignedInBody> {
    const result = await this.operators.verify(
      body.email,
      body.password,
      body.code,
      this.clientIp.context(request),
    );
    response.setHeader('Set-Cookie', result.cookie);
    return { csrfToken: result.csrfToken };
  }

  @Post('backup-codes/regenerate')
  @HttpCode(200)
  @UseGuards(OperatorSessionGuard)
  @ResponseMessage('BackupCodesRegenerated')
  @ApiOperation({
    summary: 'Regenerate the ten backup codes, invalidating the old set',
    description:
      'Re-asserts the password and a second factor (TOTP or a still-valid backup code) as a step-up ' +
      "check -- the signed-in session alone is not enough to wipe the account's own recovery codes.",
  })
  @ApiBody({ type: OperatorRegenerateBackupCodesDto })
  @ZodResponse({ type: OperatorBackupCodesDto })
  regenerateBackupCodes(
    @Body(new ZodValidationPipe(operatorRegenerateBackupCodesSchema))
    body: OperatorRegenerateBackupCodesDto,
    @Req() request: HttpRequest & { operatorSession: OperatorSessionRecord },
  ): Promise<{ backupCodes: string[] }> {
    return this.operators
      .regenerateBackupCodes(request.operatorSession.operatorId, body.password, body.code)
      .then((backupCodes) => ({ backupCodes }));
  }

  @Post('signout')
  @HttpCode(200)
  @UseGuards(OperatorSessionGuard)
  @ResponseMessage('SignedOut')
  @ApiOperation({ summary: 'Sign out of the operator console' })
  @ZodResponse({ type: OkDto })
  async signout(
    @Req() request: HttpRequest & { operatorSession: OperatorSessionRecord },
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<{ ok: true }> {
    await this.operators.revoke(request.operatorSession.id);
    response.setHeader('Set-Cookie', this.operators.clearCookie());
    return { ok: true };
  }
}

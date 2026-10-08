import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ClientIp } from '../../../common/client-ip';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { type HttpRequest, type HttpResponse } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  operatorEnrollSchema,
  operatorSigninSchema,
  operatorVerifySchema,
} from '@lytronix/validators';
import { OperatorEnrollDto, OperatorSigninDto, OperatorVerifyDto } from '../dto/operator-auth.dto';
import { OperatorSessionGuard } from '../guards/operator-session.guard';
import { OperatorAuthService } from '../services/operator-auth.service';
import type { OperatorSessionRecord } from '../ports/operator-gateway';
import type { OperatorSigninResult } from '../types/session';

interface OperatorSignedInBody {
  csrfToken: string;
}

// ADM-01, D8: the operator console's own sign-in, separate from the tenant dashboard's (/auth). A tenant
// credential has no account here and vice versa.
@Controller('auth/operator')
@SkipTenant()
export class OperatorAuthController {
  constructor(
    @Inject(OperatorAuthService) private readonly operators: OperatorAuthService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Post('signin')
  @HttpCode(200)
  signin(
    @Body(new ZodValidationPipe(operatorSigninSchema)) body: OperatorSigninDto,
  ): Promise<OperatorSigninResult> {
    return this.operators.signin(body.email, body.password);
  }

  @Post('enroll')
  @HttpCode(200)
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

  @Post('signout')
  @HttpCode(200)
  @UseGuards(OperatorSessionGuard)
  async signout(
    @Req() request: HttpRequest & { operatorSession: OperatorSessionRecord },
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<{ ok: true }> {
    await this.operators.revoke(request.operatorSession.id);
    response.setHeader('Set-Cookie', this.operators.clearCookie());
    return { ok: true };
  }
}

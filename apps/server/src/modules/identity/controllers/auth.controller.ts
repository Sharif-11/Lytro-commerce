import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ClientIp } from '../../../common/client-ip';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { AllowPendingPassword } from '../../../common/decorators/allow-pending-password';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { type HttpRequest, type HttpResponse } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  ForgotPasswordDto,
  RequestEmailCodeDto,
  VerifyEmailCodeDto,
  PasswordSigninDto,
  RequestSigninCodeDto,
  SetPasswordDto,
  VerifyForgotPasswordDto,
  VerifySigninCodeDto,
} from '../dto/auth.dto';
import { CodeIssuedDto, PhoneSignedInBodyDto, SignedInBodyDto } from '../dto/auth-response.dto';
import { SessionGuard } from '../guards/session.guard';
import type { SessionRecord } from '../ports/session-store';
import { ForgotPasswordService } from '../services/forgot-password.service';
import { PasswordSigninService } from '../services/password-signin.service';
import { PasswordService } from '../services/password.service';
import { EmailSigninService } from '../services/email-signin.service';
import { ForgotPasswordEmailDto, VerifyForgotPasswordEmailDto } from '../dto/forgot-email.dto';
import { SigninService } from '../services/signin.service';
import type { NextStep } from '../types/signed-in';
import { SessionService } from '../services/session.service';
import type { CodeIssued } from '../types/code-issued';

interface SignedInBody {
  next: NextStep;
  tenantId: string | null;
  csrfToken: string;
}

interface PhoneSignedInBody extends SignedInBody {
  suggestPassword: boolean;
}

// Sign-in runs before any shop exists on the platform host, so these routes skip the tenant check (TEN-7a).
@ApiTags('Auth')
@Controller('auth')
@SkipTenant()
export class AuthController {
  constructor(
    @Inject(SigninService) private readonly signin: SigninService,
    @Inject(EmailSigninService) private readonly emailSignin: EmailSigninService,
    @Inject(PasswordSigninService) private readonly passwordSignin: PasswordSigninService,
    @Inject(ForgotPasswordService) private readonly forgot: ForgotPasswordService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Post('phone/code')
  @HttpCode(200)
  @ResponseMessage('CodeSent')
  @ApiOperation({ summary: 'Request a sign-in code by SMS' })
  @ApiBody({ type: RequestSigninCodeDto })
  @ZodResponse({ type: CodeIssuedDto })
  requestCode(
    @Body(new ZodValidationPipe(RequestSigninCodeDto.schema)) body: RequestSigninCodeDto,
  ): Promise<CodeIssued> {
    return this.signin.requestCode(body.phone);
  }

  @Post('phone/verify')
  @HttpCode(200)
  @ResponseMessage('SignedIn')
  @ApiOperation({ summary: 'Verify a phone sign-in code' })
  @ApiBody({ type: VerifySigninCodeDto })
  @ZodResponse({ type: PhoneSignedInBodyDto })
  async verifyCode(
    @Body(new ZodValidationPipe(VerifySigninCodeDto.schema)) body: VerifySigninCodeDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<PhoneSignedInBody> {
    const result = await this.signin.verifyCode(
      body.phone,
      body.code,
      this.clientIp.context(request),
    );
    response.setHeader('Set-Cookie', result.cookie);
    return {
      next: result.next,
      tenantId: result.tenantId,
      csrfToken: result.csrfToken,
      suggestPassword: result.suggestPassword,
    };
  }

  @Post('email/code')
  @HttpCode(200)
  @ResponseMessage('CodeSent')
  @ApiOperation({ summary: 'Request a sign-in code by email' })
  @ApiBody({ type: RequestEmailCodeDto })
  @ZodResponse({ type: CodeIssuedDto })
  requestEmailCode(
    @Body(new ZodValidationPipe(RequestEmailCodeDto.schema)) body: RequestEmailCodeDto,
  ): Promise<CodeIssued> {
    return this.emailSignin.requestCode(body.email);
  }

  @Post('email/verify')
  @HttpCode(200)
  @ResponseMessage('SignedIn')
  @ApiOperation({ summary: 'Verify an email sign-in code' })
  @ApiBody({ type: VerifyEmailCodeDto })
  @ZodResponse({ type: SignedInBodyDto })
  async verifyEmailCode(
    @Body(new ZodValidationPipe(VerifyEmailCodeDto.schema)) body: VerifyEmailCodeDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<SignedInBody> {
    const result = await this.emailSignin.verifyCode(
      body.email,
      body.code,
      this.clientIp.context(request),
    );
    response.setHeader('Set-Cookie', result.cookie);
    return { next: result.next, tenantId: result.tenantId, csrfToken: result.csrfToken };
  }

  @Post('signin')
  @HttpCode(200)
  @ResponseMessage('SignedIn')
  @ApiOperation({ summary: 'Sign in with a phone number and password' })
  @ApiBody({ type: PasswordSigninDto })
  @ZodResponse({ type: SignedInBodyDto })
  async signInWithPassword(
    @Body(new ZodValidationPipe(PasswordSigninDto.schema)) body: PasswordSigninDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<SignedInBody> {
    const result = await this.passwordSignin.signIn(
      body.phone,
      body.password,
      this.clientIp.context(request),
    );
    response.setHeader('Set-Cookie', result.cookie);
    return { next: result.next, tenantId: result.tenantId, csrfToken: result.csrfToken };
  }

  @Post('forgot-password')
  @HttpCode(200)
  @ResponseMessage('CodeSent')
  @ApiOperation({ summary: 'Request a password-reset code by SMS' })
  @ApiBody({ type: ForgotPasswordDto })
  @ZodResponse({ type: CodeIssuedDto })
  requestReset(
    @Body(new ZodValidationPipe(ForgotPasswordDto.schema)) body: ForgotPasswordDto,
  ): Promise<CodeIssued> {
    return this.forgot.request(body.phone);
  }

  @Post('forgot-password/resend')
  @HttpCode(200)
  @ResponseMessage('CodeSent')
  @ApiOperation({
    summary:
      "Resend a password-reset code from the reset-code screen's own resend button (AUTH-18)",
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ZodResponse({ type: CodeIssuedDto })
  resendReset(
    @Body(new ZodValidationPipe(ForgotPasswordDto.schema)) body: ForgotPasswordDto,
  ): Promise<CodeIssued> {
    return this.forgot.resend(body.phone);
  }

  @Post('forgot-password/email')
  @HttpCode(200)
  @ResponseMessage('CodeSent')
  @ApiOperation({ summary: 'Request a password-reset code by email' })
  @ApiBody({ type: ForgotPasswordEmailDto })
  @ZodResponse({ type: CodeIssuedDto })
  requestResetByEmail(
    @Body(new ZodValidationPipe(ForgotPasswordEmailDto.schema)) body: ForgotPasswordEmailDto,
  ): Promise<CodeIssued> {
    return this.forgot.requestByEmail(body.email);
  }

  @Post('forgot-password/email/verify')
  @HttpCode(200)
  @ResponseMessage('CodeVerified')
  @ApiOperation({ summary: 'Verify an email password-reset code' })
  @ApiBody({ type: VerifyForgotPasswordEmailDto })
  @ZodResponse({ type: SignedInBodyDto })
  async verifyResetByEmail(
    @Body(new ZodValidationPipe(VerifyForgotPasswordEmailDto.schema))
    body: VerifyForgotPasswordEmailDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<SignedInBody> {
    const result = await this.forgot.verifyByEmail(
      body.email,
      body.code,
      this.clientIp.context(request),
    );
    response.setHeader('Set-Cookie', result.cookie);
    return { next: result.next, tenantId: result.tenantId, csrfToken: result.csrfToken };
  }

  @Post('forgot-password/verify')
  @HttpCode(200)
  @ResponseMessage('CodeVerified')
  @ApiOperation({ summary: 'Verify a phone password-reset code' })
  @ApiBody({ type: VerifyForgotPasswordDto })
  @ZodResponse({ type: SignedInBodyDto })
  async verifyReset(
    @Body(new ZodValidationPipe(VerifyForgotPasswordDto.schema)) body: VerifyForgotPasswordDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<SignedInBody> {
    const result = await this.forgot.verify(body.phone, body.code, this.clientIp.context(request));
    response.setHeader('Set-Cookie', result.cookie);
    return { next: result.next, tenantId: result.tenantId, csrfToken: result.csrfToken };
  }

  @Post('password')
  @HttpCode(200)
  @AllowPendingPassword()
  @UseGuards(SessionGuard)
  @ResponseMessage('PasswordSet')
  @ApiOperation({ summary: 'Set a password for the signed-in account' })
  @ApiBody({ type: SetPasswordDto })
  @ZodResponse({ type: OkDto })
  async setPassword(
    @Body(new ZodValidationPipe(SetPasswordDto.schema)) body: SetPasswordDto,
    @Req() request: HttpRequest & { session: SessionRecord },
  ): Promise<{ ok: true }> {
    await this.passwords.set(request.session, body);
    return { ok: true };
  }

  @Post('signout')
  @HttpCode(200)
  @AllowPendingPassword()
  @UseGuards(SessionGuard)
  @ResponseMessage('SignedOut')
  @ApiOperation({ summary: 'Sign out of the current session' })
  @ZodResponse({ type: OkDto })
  async signout(
    @Req() request: HttpRequest & { session: SessionRecord },
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<{ ok: true }> {
    await this.sessions.revoke(request.session);
    response.setHeader('Set-Cookie', this.sessions.clearCookie());
    return { ok: true };
  }
}

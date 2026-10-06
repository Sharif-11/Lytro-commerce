import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CodeIssued } from '../types/code-issued';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { AddIdentityCodeDto, VerifyAddIdentityDto } from '../dto/identity.dto';
import { DashboardGuard, type DashboardRequest } from '../guards/dashboard.guard';
import { SessionGuard } from '../guards/session.guard';
import { IdentitiesService } from '../services/identities.service';
import type { OauthAttached } from '../types/oauth';
import type { IdentityKind } from '@lytronix/validators';

// The sign-in methods on the signed-in account (AUTH-26). Like the account summary, these work without a shop.
@Controller('me/identities')
@Dashboard({ lapsed: true, withoutShop: true })
@UseGuards(SessionGuard, DashboardGuard)
export class IdentitiesController {
  constructor(@Inject(IdentitiesService) private readonly identities: IdentitiesService) {}

  @Get()
  async list(
    @Req() request: DashboardRequest,
  ): Promise<{ identities: { id: string; kind: IdentityKind; value: string }[] }> {
    const rows = await this.identities.list(this.subscriberOf(request));
    return { identities: rows };
  }

  @Post('code')
  @HttpCode(200)
  requestCode(
    @Body(new ZodValidationPipe(AddIdentityCodeDto.schema)) body: AddIdentityCodeDto,
  ): Promise<CodeIssued> {
    return this.identities.requestCode(body.kind, body.value);
  }

  @Post('verify')
  @HttpCode(200)
  verify(
    @Body(new ZodValidationPipe(VerifyAddIdentityDto.schema)) body: VerifyAddIdentityDto,
    @Req() request: DashboardRequest,
  ): Promise<OauthAttached> {
    return this.identities.verifyAdd(this.subscriberOf(request), body.kind, body.value, body.code);
  }

  @Post('oauth/:provider/start')
  @HttpCode(200)
  startProvider(
    @Param('provider') provider: string,
    @Req() request: DashboardRequest,
  ): Promise<{ url: string }> {
    return this.identities.startProviderAdd(this.subscriberOf(request), provider);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.identities.remove(this.subscriberOf(request), id);
    return { ok: true };
  }

  /** The signed-in subscriber; the session guard has already checked that one exists. */
  private subscriberOf(request: DashboardRequest): string {
    if (!request.session) throw new ApiError('unauthenticated', 'Sign in to continue.', {});
    return request.session.subscriberId;
  }
}

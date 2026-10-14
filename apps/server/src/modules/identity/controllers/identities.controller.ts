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
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { CodeIssued } from '../types/code-issued';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { AddIdentityCodeDto, VerifyAddIdentityDto } from '../dto/identity.dto';
import { CodeIssuedDto } from '../dto/auth-response.dto';
import { IdentitiesListDto, OauthAttachedDto, OauthUrlDto } from '../dto/identities-response.dto';
import { DashboardGuard, type DashboardRequest } from '../guards/dashboard.guard';
import { SessionGuard } from '../guards/session.guard';
import { IdentitiesService } from '../services/identities.service';
import type { OauthAttached } from '../types/oauth';
import type { IdentityKind } from '@lytronix/validators';

// The sign-in methods on the signed-in account (AUTH-26). Like the account summary, these work without a shop.
@ApiTags('Identities')
@Controller('me/identities')
@Dashboard({ lapsed: true, withoutShop: true })
@UseGuards(SessionGuard, DashboardGuard)
export class IdentitiesController {
  constructor(@Inject(IdentitiesService) private readonly identities: IdentitiesService) {}

  @Get()
  @ResponseMessage('IdentitiesListed')
  @ApiOperation({ summary: "List the signed-in account's sign-in methods" })
  @ZodResponse({ type: IdentitiesListDto })
  async list(
    @Req() request: DashboardRequest,
  ): Promise<{ identities: { id: string; kind: IdentityKind; value: string }[] }> {
    const rows = await this.identities.list(this.subscriberOf(request));
    return { identities: rows };
  }

  @Post('code')
  @HttpCode(200)
  @ResponseMessage('CodeSent')
  @ApiOperation({ summary: 'Request a code to verify a new sign-in method' })
  @ApiBody({ type: AddIdentityCodeDto })
  @ZodResponse({ type: CodeIssuedDto })
  requestCode(
    @Body(new ZodValidationPipe(AddIdentityCodeDto.schema)) body: AddIdentityCodeDto,
  ): Promise<CodeIssued> {
    return this.identities.requestCode(body.kind, body.value);
  }

  @Post('verify')
  @HttpCode(200)
  @ResponseMessage('IdentityAdded')
  @ApiOperation({ summary: 'Verify the code and add the new sign-in method' })
  @ApiBody({ type: VerifyAddIdentityDto })
  @ZodResponse({ type: OauthAttachedDto })
  verify(
    @Body(new ZodValidationPipe(VerifyAddIdentityDto.schema)) body: VerifyAddIdentityDto,
    @Req() request: DashboardRequest,
  ): Promise<OauthAttached> {
    return this.identities.verifyAdd(this.subscriberOf(request), body.kind, body.value, body.code);
  }

  @Post('oauth/:provider/start')
  @HttpCode(200)
  @ResponseMessage('OauthRedirectReady')
  @ApiOperation({ summary: 'Start adding a Google or Facebook sign-in method' })
  @ZodResponse({ type: OauthUrlDto })
  startProvider(
    @Param('provider') provider: string,
    @Req() request: DashboardRequest,
  ): Promise<{ url: string }> {
    return this.identities.startProviderAdd(this.subscriberOf(request), provider);
  }

  @Delete(':id')
  @HttpCode(200)
  @ResponseMessage('IdentityRemoved')
  @ApiOperation({ summary: 'Remove a sign-in method' })
  @ZodResponse({ type: OkDto })
  async remove(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.identities.remove(this.subscriberOf(request), id);
    return { ok: true };
  }

  /** The signed-in subscriber; the session guard has already checked that one exists. */
  private subscriberOf(request: DashboardRequest): string {
    if (!request.session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return request.session.subscriberId;
  }
}

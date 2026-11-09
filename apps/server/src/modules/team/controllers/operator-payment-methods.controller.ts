import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { LytroPaymentMethods } from '../../lytro-payments/services/lytro-payment-methods';
import type {
  LytroBankAccount,
  LytroGatewayTest,
  LytroPaymentMethodsView,
} from '../../lytro-payments/types/lytro-payments';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  CreatePlatformBankAccountDto,
  LytroGatewayTestDto,
  LytroPaymentMethodsDto,
  PlatformBankAccountDto,
  PlatformGatewayKeysDto,
  UpdatePlatformBankAccountDto,
  UpdatePlatformPaymentMethodDto,
} from '../dto/operator-payment-methods.dto';

// OPERATOR-CONSOLE-DESIGN §10, ADM-10 (2026-11-09): what shops may pay Lytro by, how each is confirmed, Lytro's bank accounts and its
// own checkout keys. The numbers themselves stay at /operator/platform-wallets.
@ApiTags('Operator Payment Methods')
@Controller('operator/payment-methods')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPaymentMethodsController {
  constructor(@Inject(LytroPaymentMethods) private readonly methods: LytroPaymentMethods) {}

  @Get()
  @ResponseMessage('LytroPaymentMethodsListed')
  @ApiOperation({ summary: "What shops may pay Lytro by, and each one's way" })
  @ZodResponse({ type: LytroPaymentMethodsDto })
  view(): Promise<LytroPaymentMethodsView> {
    return this.methods.view();
  }

  @Post('bank-accounts')
  @ResponseMessage('LytroBankAccountSaved')
  @ApiOperation({ summary: 'Add one of Lytro bank accounts' })
  @ZodResponse({ type: PlatformBankAccountDto })
  addBankAccount(
    @Body(new ZodValidationPipe(CreatePlatformBankAccountDto.schema))
    body: CreatePlatformBankAccountDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<LytroBankAccount> {
    return this.methods.addBankAccount(body, this.operatorIdOf(request));
  }

  @Patch('bank-accounts/:id')
  @ResponseMessage('LytroBankAccountSaved')
  @ApiOperation({ summary: 'Change one of Lytro bank accounts' })
  @ZodResponse({ type: PlatformBankAccountDto })
  updateBankAccount(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePlatformBankAccountDto.schema))
    body: UpdatePlatformBankAccountDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<LytroBankAccount> {
    return this.methods.updateBankAccount(id, body, this.operatorIdOf(request));
  }

  @Delete('bank-accounts/:id')
  @ResponseMessage('LytroBankAccountRemoved')
  @ApiOperation({ summary: 'Remove one of Lytro bank accounts' })
  @ZodResponse({ type: OkDto })
  async removeBankAccount(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.methods.removeBankAccount(id, this.operatorIdOf(request));
    return { ok: true };
  }

  @Patch(':method')
  @ResponseMessage('LytroPaymentMethodChanged')
  @ApiOperation({ summary: 'Turn a method on or off, or change how its payments are confirmed' })
  @ZodResponse({ type: LytroPaymentMethodsDto })
  update(
    @Param('method') method: string,
    @Body(new ZodValidationPipe(UpdatePlatformPaymentMethodDto.schema))
    body: UpdatePlatformPaymentMethodDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<LytroPaymentMethodsView> {
    return this.methods.update(method, body, this.operatorIdOf(request));
  }

  @Put(':method/gateway')
  @ResponseMessage('LytroGatewayKeysSaved')
  @ApiOperation({ summary: "Lytro's own checkout keys: sealed, and never returned" })
  @ZodResponse({ type: OkDto })
  async saveKeys(
    @Param('method') method: string,
    @Body(new ZodValidationPipe(PlatformGatewayKeysDto.schema)) body: PlatformGatewayKeysDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.methods.saveKeys(method, body, this.operatorIdOf(request));
    return { ok: true };
  }

  @Delete(':method/gateway')
  @ResponseMessage('LytroGatewayKeysRemoved')
  @ApiOperation({ summary: "Remove Lytro's own checkout keys, which ends automatic checkout" })
  @ZodResponse({ type: OkDto })
  async removeKeys(
    @Param('method') method: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.methods.removeKeys(method, this.operatorIdOf(request));
    return { ok: true };
  }

  @Post(':method/gateway/test')
  @ResponseMessage('LytroGatewayTested')
  @ApiOperation({
    summary: "Ask for a token with Lytro's keys; bKash allows two such calls an hour",
  })
  @ZodResponse({ type: LytroGatewayTestDto })
  test(@Param('method') method: string): Promise<LytroGatewayTest> {
    return this.methods.testKeys(method);
  }

  private operatorIdOf(request: OperatorSessionRequest): string {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return session.operatorId;
  }
}

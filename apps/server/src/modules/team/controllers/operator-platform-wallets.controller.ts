import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { PlatformWalletsService } from '../../balance/services/platform-wallets.service';
import type { PlatformWallet } from '../../balance/types/platform-wallet';
import { CreatePlatformWalletDto, UpdatePlatformWalletDto } from '../dto/balance.dto';
import { PlatformWalletDto } from '../dto/balance-response.dto';

// BIL-02/BAL-03: the operator's own management screen for the platform's wallet numbers.
@ApiTags('Operator Platform Wallets')
@Controller('operator/platform-wallets')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPlatformWalletsController {
  constructor(@Inject(PlatformWalletsService) private readonly wallets: PlatformWalletsService) {}

  @Get()
  @ResponseMessage('PlatformWalletsListed')
  @ApiOperation({ summary: 'List every platform wallet, including disabled ones' })
  @ZodResponse({ type: [PlatformWalletDto] })
  list(): Promise<PlatformWallet[]> {
    return this.wallets.list(false);
  }

  @Post()
  @ResponseMessage('PlatformWalletAdded')
  @ApiOperation({ summary: 'Add a platform wallet number' })
  @ApiBody({ type: CreatePlatformWalletDto })
  @ZodResponse({ type: PlatformWalletDto })
  create(
    @Body(new ZodValidationPipe(CreatePlatformWalletDto.schema)) body: CreatePlatformWalletDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlatformWallet> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.wallets.create(
      {
        provider: body.provider,
        number: body.number,
        label: body.label ?? null,
        enabled: body.enabled ?? true,
        displayOrder: body.displayOrder ?? 0,
      },
      session.operatorId,
    );
  }

  @Patch(':id')
  @ResponseMessage('PlatformWalletUpdated')
  @ApiOperation({ summary: 'Update a platform wallet number' })
  @ApiBody({ type: UpdatePlatformWalletDto })
  @ZodResponse({ type: PlatformWalletDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePlatformWalletDto.schema)) body: UpdatePlatformWalletDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<PlatformWallet> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.wallets.update(id, body, session.operatorId);
  }

  @Delete(':id')
  @ResponseMessage('PlatformWalletRemoved')
  @ApiOperation({ summary: 'Remove a platform wallet number' })
  @ZodResponse({ type: OkDto })
  async remove(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    await this.wallets.remove(id, session.operatorId);
    return { ok: true };
  }
}

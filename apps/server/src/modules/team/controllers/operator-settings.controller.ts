import { Body, Controller, Get, Inject, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { PlatformSettingKey } from '@lytronix/validators';
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
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { PlatformSettingValue } from '../../platform-settings/types/platform-setting';
import { UpdateSettingDto } from '../dto/settings.dto';
import { SettingValueListDto } from '../dto/settings-response.dto';

function isSettingKey(key: string): key is PlatformSettingKey {
  return (Object.values(PlatformSettingKey) as string[]).includes(key);
}

function parseKey(key: string): PlatformSettingKey {
  if (!isSettingKey(key)) throw new ApiError('not_found', 'UnknownSetting', { key });
  return key;
}

// LIF-26: every platform-wide editable value that isn't a per-use rate (operator-rates.controller.ts).
@ApiTags('Operator Settings')
@Controller('operator/settings')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorSettingsController {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  @Get()
  @ResponseMessage('SettingsListed')
  @ApiOperation({ summary: 'List every platform setting' })
  @ZodResponse({ type: SettingValueListDto })
  list(): Promise<PlatformSettingValue[]> {
    return this.settings.list();
  }

  @Patch(':key')
  @ResponseMessage('SettingUpdated')
  @ApiOperation({ summary: 'Update a platform setting' })
  @ApiBody({ type: UpdateSettingDto })
  @ZodResponse({ type: OkDto })
  async change(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateSettingDto.schema)) body: UpdateSettingDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    await this.settings.set(parseKey(key), body.value, session.operatorId);
    return { ok: true };
  }
}

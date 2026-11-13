import { Body, Controller, Get, Inject, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import type { DegradedState } from '../../degraded-mode/services/degraded-mode';
import { DegradedSwitch } from '../../degraded-mode/services/degraded-switch';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { DegradedModeDto, DegradedModeSwitchDto } from '../dto/operator-degraded-mode.dto';
import { CatalogueRequest } from '../services/catalogue-request';

// DAT-38, D9-14 (Phase 9 Slice 9.5): the operator's degraded-mode switch. Its factor is an ordinary setting
// (`degraded_factor`, PATCH /operator/settings/:key); the switch is only here, because it puts a notice up and takes it
// down. The screen is Slice 9.9's.
@ApiTags('Operator Degraded Mode')
@Controller('operator/degraded-mode')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorDegradedModeController {
  constructor(
    @Inject(DegradedSwitch) private readonly degraded: DegradedSwitch,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @ResponseMessage('DegradedModeShown')
  @ApiOperation({ summary: 'Whether degraded mode is on, its notice and its factor (DAT-38)' })
  @ZodResponse({ type: DegradedModeDto })
  state(): Promise<DegradedState> {
    return this.degraded.state();
  }

  @Put()
  @ResponseMessage('DegradedModeSwitched')
  @ApiOperation({
    summary:
      'Turn degraded mode on (per-minute limits divided, heavy work paused, a notice to every shop) or off (DAT-38)',
  })
  @ApiBody({ type: DegradedModeSwitchDto })
  @ZodResponse({ type: DegradedModeDto })
  turn(
    @Body(new ZodValidationPipe(DegradedModeSwitchDto.schema)) body: DegradedModeSwitchDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<DegradedState> {
    return this.degraded.turn(body.on, this.request.operatorOf(request));
  }
}

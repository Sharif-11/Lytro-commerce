import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { HELP_LINE_CACHE, HelpLineDto } from '../../help-line/dto/help-line.dto';
import { HelpLine, type HelpLineView } from '../../help-line/services/help-line';

// D8-4, D8-68 (Phase 8 Slice 8.7, read agreed 2026-11-10): Lytro's help line, platform-wide like the plans for sale, and read
// by a signed-in shop's dashboard and the website alike -- no key or session. Cached a few minutes in the browser and on the
// way, since it changes only when the operator changes it.
@ApiTags('Help line')
@Controller()
@SkipTenant()
export class HelpLineController {
  constructor(@Inject(HelpLine) private readonly helpLine: HelpLine) {}

  @Get('help-line')
  @Header('Cache-Control', HELP_LINE_CACHE)
  @ResponseMessage('HelpLineRead')
  @ApiOperation({
    summary: "Lytro's WhatsApp and phone numbers and the hours it answers, every day (D8-4)",
  })
  @ZodResponse({ type: HelpLineDto })
  read(): Promise<HelpLineView> {
    return this.helpLine.current();
  }
}

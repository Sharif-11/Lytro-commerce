import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { HELP_LINE_CACHE, HelpLineDto } from '../../help-line/dto/help-line.dto';
import { HelpLine, type HelpLineView } from '../../help-line/services/help-line';

// D8-74 (Phase 8 Slice 8.8, the owner's answer of 2026-11-10): the listener app reads Lytro's help line when it opens, and
// keeps the number it was built with for when this fails. It calls only the API host, which answers public routes alone
// (KNOWN-GAPS §141), so the line is served there too, at /v1/listener/help-line, with no device token: the same answer
// as GET /help-line, platform-wide and owned by no shop.
@ApiTags('Listener app')
@Controller('public/listener')
@PublicApiRoute()
@SkipTenant()
export class ListenerHelpLineController {
  constructor(@Inject(HelpLine) private readonly helpLine: HelpLine) {}

  @Get('help-line')
  @Header('Cache-Control', HELP_LINE_CACHE)
  @ResponseMessage('HelpLineRead')
  @ApiOperation({
    summary: "Lytro's help line for the listener app: WhatsApp, phone and hours, every day (D8-74)",
  })
  @ZodResponse({ type: HelpLineDto })
  read(): Promise<HelpLineView> {
    return this.helpLine.current();
  }
}

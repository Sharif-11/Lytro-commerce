import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { LEGAL_VERSIONS_CACHE, LegalVersionsDto } from '../../legal/dto/legal-versions.dto';
import { LegalVersions, type LegalVersionsView } from '../../legal/services/legal-versions';

// LEG-01, LEG-02 (Phase 9 Slice 9.8): the terms and privacy versions in force, platform-wide like the help line, read by the
// website's /terms and /privacy so they show the very version sign-up records -- no key or session.
@ApiTags('Legal')
@Controller()
@SkipTenant()
export class LegalVersionsController {
  constructor(@Inject(LegalVersions) private readonly versions: LegalVersions) {}

  @Get('legal-versions')
  @Header('Cache-Control', LEGAL_VERSIONS_CACHE)
  @ResponseMessage('LegalVersionsRead')
  @ApiOperation({
    summary: 'The terms of service and privacy policy versions a new account accepts now (LEG-01)',
  })
  @ZodResponse({ type: LegalVersionsDto })
  read(): Promise<LegalVersionsView> {
    return this.versions.current();
  }
}

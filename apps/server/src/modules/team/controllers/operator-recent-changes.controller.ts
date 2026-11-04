import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { OperatorSessionGuard } from '../../operator/guards/operator-session.guard';
import { RecentChanges } from '../../operator/services/recent-changes';
import type { RecentChange } from '../../operator/types/recent-change';
import { RecentChangeListDto } from '../dto/operator-console.dto';

// OPERATOR-CONSOLE-DESIGN §3: Today's "Recent changes", in one read rather than a history call per rate.
@ApiTags('Operator Recent Changes')
@Controller('operator/recent-changes')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorRecentChangesController {
  constructor(@Inject(RecentChanges) private readonly changes: RecentChanges) {}

  @Get()
  @ResponseMessage('RecentChangesListed')
  @ApiOperation({ summary: 'The last rate and setting changes and suspensions, newest first' })
  @ZodResponse({ type: RecentChangeListDto })
  list(): Promise<RecentChange[]> {
    return this.changes.list();
  }
}

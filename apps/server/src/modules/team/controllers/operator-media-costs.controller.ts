import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { MediaCostsQuery } from '@lytronix/validators';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { MediaCosts, type MediaCostsView } from '../../media-costs/services/media-costs';
import { OperatorSessionGuard } from '../../operator/guards/operator-session.guard';
import { MediaCostsQueryDto, MediaCostsViewDto } from '../dto/operator-media-costs.dto';

// MED-12, D8-17, D8-57 to D8-64 (Phase 8 Slice 8.6): the media costs page. Read only; the budget, its alert's percent
// and address, the billing day and Cloudflare's prices are platform settings (PATCH /operator/settings/:key).
@ApiTags('Operator Media Costs')
@Controller('operator/media-costs')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorMediaCostsController {
  constructor(@Inject(MediaCosts) private readonly costs: MediaCosts) {}

  @Get()
  @ResponseMessage('MediaCostsRead')
  @ApiOperation({
    summary:
      "A billing period's Cloudflare costs so far: R2 by bucket, the media Worker's requests, the top shops, against the budget (D8-57)",
  })
  @ZodResponse({ type: MediaCostsViewDto })
  view(
    @Query(new ZodValidationPipe(MediaCostsQueryDto.schema)) query: MediaCostsQuery,
  ): Promise<MediaCostsView> {
    return this.costs.view(query);
  }
}

import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  catalogueIdSchema,
  courierCredentialUsesQuerySchema,
  type CourierCredentialUsesQuery,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { CourierConnections } from '../../couriers/services/courier-connections';
import { OperatorSessionGuard } from '../../operator/guards/operator-session.guard';
import { CourierCredentialUsePageDto } from '../dto/couriers.dto';

// SEC-11 (Phase 6 Slice 6.1): a shop's log of its stored courier credentials' uses, for a dispute or an anomaly, without any credential.
@ApiTags('Operator Couriers')
@Controller('operator')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorCouriersController {
  constructor(@Inject(CourierConnections) private readonly connections: CourierConnections) {}

  @Get('tenants/:id/courier-credential-uses')
  @ResponseMessage('CourierCredentialUsesListed')
  @ApiOperation({
    summary:
      "A shop's log of its stored courier credentials' uses, newest first, without any credential (SEC-11); with failed=true, only the calls that failed or the courier refused (ADM-03)",
  })
  @ZodResponse({ type: CourierCredentialUsePageDto })
  credentialUses(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(courierCredentialUsesQuerySchema))
    query: CourierCredentialUsesQuery,
  ): ReturnType<CourierConnections['uses']> {
    const parsed = catalogueIdSchema.safeParse(id);
    if (!parsed.success) throw new ApiError('not_found', 'ShopNotFound', {});
    return this.connections.uses(parsed.data, query.page, query.limit, query.failed ?? false);
  }
}

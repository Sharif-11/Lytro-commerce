import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { LocationService } from '../../delivery/services/location.service';
import type { LocationsView } from '../../delivery/types/delivery';
import { OperatorSessionGuard } from '../../operator/guards/operator-session.guard';
import { LocationsViewDto } from '../dto/delivery.dto';

// CUS-08, CUS-10 (Phase 6 Slice 6.7): the same zilla and thana list the shops' address forms read, for the operator placing a
// courier's area in a thana.
@ApiTags('Operator Couriers')
@Controller('operator/locations')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorLocationsController {
  constructor(@Inject(LocationService) private readonly locations: LocationService) {}

  @Get()
  @ResponseMessage('LocationsListed')
  @ApiOperation({
    summary: 'The zillas with their thanas, for placing a courier area in a thana (CUS-08, CUS-10)',
  })
  @ZodResponse({ type: LocationsViewDto })
  list(): Promise<LocationsView> {
    return this.locations.list();
  }
}

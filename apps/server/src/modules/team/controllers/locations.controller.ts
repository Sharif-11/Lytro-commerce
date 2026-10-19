import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { LocationService } from '../../delivery/services/location.service';
import type { LocationsView } from '../../delivery/types/delivery';
import { DashboardGuard } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { LocationsViewDto } from '../dto/delivery.dto';

// CUS-08: the canonical zilla and thana list every address form uses. Platform data, the same for every shop, so a
// signed-in member of the shop reads it whatever their permissions; the public storefront's key-authenticated read
// arrives with public keys (Slice 8).
@ApiTags('Delivery')
@Controller('locations')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard)
export class LocationsController {
  constructor(@Inject(LocationService) private readonly locations: LocationService) {}

  @Get()
  @ResponseMessage('LocationsListed')
  @ApiOperation({ summary: 'List the zillas with their thanas, and the 11 city areas (CUS-08)' })
  @ZodResponse({ type: LocationsViewDto })
  list(): Promise<LocationsView> {
    return this.locations.list();
  }
}

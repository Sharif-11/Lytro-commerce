import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { SerialService } from '../../inventory/services/serial.service';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { CheckSerialsDto, SerialCheckDto } from '../dto/inventory.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// INV-23: serials checked against the whole shop while they are entered -- a new product's opening serials, or those
// added to units already held -- by anyone who may enter them.
@ApiTags('Inventory')
@Controller('serials')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class SerialChecksController {
  constructor(
    @Inject(SerialService) private readonly serials: SerialService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Post('check')
  @HttpCode(200)
  @RequirePermission([Permission.ProductsManage, Permission.InventoryManage])
  @ResponseMessage('SerialsChecked')
  @ApiOperation({
    summary: 'Which of the serials being entered a unit the shop holds already has (INV-23)',
  })
  @ApiBody({ type: CheckSerialsDto })
  @ZodResponse({ type: SerialCheckDto })
  check(
    @Body(new ZodValidationPipe(CheckSerialsDto.schema)) body: CheckSerialsDto,
    @Req() request: DashboardRequest,
  ): Promise<{ taken: string[] }> {
    return this.serials.check(this.catalogue.tenantIdOf(request), body);
  }
}

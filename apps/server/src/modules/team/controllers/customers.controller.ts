import { Controller, Delete, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { customerListQuerySchema, Permission, type CustomerListQuery } from '@lytronix/validators';
import { OkDto } from '../../../common/dto/ok.dto';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { CustomerService } from '../../customers/services/customer.service';
import type { CustomerPage, CustomerView } from '../../customers/types/customers';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { CustomerPageDto, CustomerViewDto } from '../dto/customers.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// CUS-01, CUS-02, CUS-09 (Phase 4 Slice 4.4a): the shop's customers as staff look them up -- the list, searched by
// name or phone, and one customer, whose orders are GET /orders?customerId= -- and deleting one at a privacy request.
// Reading them needs customers:read; deleting one, customers:manage.
@ApiTags('Customers')
@Controller('customers')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class CustomersController {
  constructor(
    @Inject(CustomerService) private readonly customers: CustomerService,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.CustomersRead)
  @ResponseMessage('CustomersRetrieved')
  @ApiOperation({
    summary: "The shop's customers, who last ordered first, searched by name or phone (CUS-02)",
  })
  @ZodResponse({ type: CustomerPageDto })
  list(
    @Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQuery,
    @Req() request: DashboardRequest,
  ): Promise<CustomerPage> {
    return this.customers.list(this.request.tenantIdOf(request), query);
  }

  @Get(':id')
  @RequirePermission(Permission.CustomersRead)
  @ResponseMessage('CustomerRetrieved')
  @ApiOperation({
    summary:
      'One customer: figures, first and last order, and where the latest delivery went (CUS-01, CUS-02)',
  })
  @ZodResponse({ type: CustomerViewDto })
  get(@Param('id') id: string, @Req() request: DashboardRequest): Promise<CustomerView> {
    return this.customers.get(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'CustomerNotFound'),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.CustomersManage)
  @ResponseMessage('CustomerErased')
  @ApiOperation({
    summary:
      "Delete a customer's details at a privacy request; their orders keep their totals; refused while an order is on its way (CUS-09)",
  })
  @ZodResponse({ type: OkDto })
  async erase(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.customers.erase(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'CustomerNotFound'),
      this.request.actorOf(request),
    );
    return { ok: true };
  }
}

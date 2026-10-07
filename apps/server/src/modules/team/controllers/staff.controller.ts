import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { staffIdSchema } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PhoneNumberFormat } from '../../identity/services/phone-number-format';
import { StaffService, type StaffTenant } from '../../staff/services/staff.service';
import type { StaffList, StaffRecord } from '../../staff/types/staff';
import { CreateStaffDto, UpdateStaffDto } from '../dto/staff.dto';

// STF-01 to STF-05 over HTTP. Staff management is for the owner until permission checks land (slice 7, step 4).
@Controller('staff')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard)
export class StaffController {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(PhoneNumberFormat) private readonly phones: PhoneNumberFormat,
  ) {}

  @Get()
  list(@Req() request: DashboardRequest): Promise<StaffList> {
    return this.staff.list(this.shopOf(request));
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateStaffDto.schema)) body: CreateStaffDto,
    @Req() request: DashboardRequest,
  ): Promise<StaffRecord> {
    this.requireOwner(request);
    const phone = this.phones.normalize(body.phone);
    if (phone === null) {
      throw new ApiError('validation_error', 'Enter a valid mobile number.', { field: 'phone' });
    }
    return this.staff.create(this.shopOf(request), {
      phone,
      password: body.password,
      name: body.name,
      roleIds: body.roleIds,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStaffDto.schema)) body: UpdateStaffDto,
    @Req() request: DashboardRequest,
  ): Promise<StaffRecord> {
    this.requireOwner(request);
    const parsed = staffIdSchema.safeParse(id);
    if (!parsed.success) throw new ApiError('not_found', 'Staff member not found.', {});
    return this.staff.update(this.shopOf(request), parsed.data, body, new Date());
  }

  private shopOf(request: DashboardRequest): StaffTenant {
    const tenant = request.tenant;
    if (!tenant)
      throw new ApiError('forbidden', 'Create your shop to continue.', { next: 'create-shop' });
    return { id: tenant.id, planLimits: tenant.planLimits };
  }

  private requireOwner(request: DashboardRequest): void {
    if (request.session?.userId !== null) {
      throw new ApiError('forbidden', 'Only the owner manages staff.', {});
    }
  }
}

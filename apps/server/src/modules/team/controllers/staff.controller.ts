import { Permission } from '@lytronix/validators';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { staffIdSchema } from '@lytronix/validators';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { PhoneNumberFormat } from '../../identity/services/phone-number-format';
import { StaffService, type StaffTenant } from '../../staff/services/staff.service';
import type { StaffList, StaffMember } from '../../staff/types/staff';
import { CreateStaffDto, ResetStaffPasswordDto, UpdateStaffDto } from '../dto/staff.dto';
import { StaffListDto, StaffMemberDto } from '../dto/staff-response.dto';

// STF-01 to STF-05 over HTTP. Each route declares the permission it needs (STF-11).
@ApiTags('Staff')
@Controller('staff')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class StaffController {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(PhoneNumberFormat) private readonly phones: PhoneNumberFormat,
  ) {}

  @Get()
  @RequirePermission(Permission.StaffRead)
  @ResponseMessage('StaffListed')
  @ApiOperation({ summary: "List the shop's staff" })
  @ZodResponse({ type: StaffListDto })
  list(@Req() request: DashboardRequest): Promise<StaffList> {
    return this.staff.list(this.shopOf(request));
  }

  @Post()
  @RequirePermission(Permission.StaffManage)
  @ResponseMessage('StaffCreated')
  @ApiOperation({ summary: 'Add a staff member' })
  @ApiBody({ type: CreateStaffDto })
  @ZodResponse({ type: StaffMemberDto })
  create(
    @Body(new ZodValidationPipe(CreateStaffDto.schema)) body: CreateStaffDto,
    @Req() request: DashboardRequest,
  ): Promise<StaffMember> {
    const phone = this.phones.normalize(body.phone);
    if (phone === null) {
      throw new ApiError('validation_error', 'PhoneInvalid', { field: 'phone' });
    }
    return this.staff.create(
      this.shopOf(request),
      {
        phone,
        password: body.password,
        name: body.name,
        roleIds: body.roleIds,
      },
      this.actorOf(request),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.StaffManage)
  @ResponseMessage('StaffUpdated')
  @ApiOperation({ summary: 'Update a staff member' })
  @ApiBody({ type: UpdateStaffDto })
  @ZodResponse({ type: StaffMemberDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStaffDto.schema)) body: UpdateStaffDto,
    @Req() request: DashboardRequest,
  ): Promise<StaffMember> {
    const parsed = staffIdSchema.safeParse(id);
    if (!parsed.success) throw new ApiError('not_found', 'StaffNotFound', {});
    return this.staff.update(
      this.shopOf(request),
      parsed.data,
      body,
      new Date(),
      this.actorOf(request),
    );
  }

  // The owner sets a new password for a staff member; they choose their own at the next sign-in (STF-13).
  @Post(':id/password')
  @HttpCode(200)
  @RequirePermission(Permission.StaffManage)
  @ResponseMessage('StaffPasswordReset')
  @ApiOperation({ summary: "Reset a staff member's password" })
  @ApiBody({ type: ResetStaffPasswordDto })
  @ZodResponse({ type: OkDto })
  async resetPassword(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResetStaffPasswordDto.schema)) body: ResetStaffPasswordDto,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    const parsed = staffIdSchema.safeParse(id);
    if (!parsed.success) throw new ApiError('not_found', 'StaffNotFound', {});
    await this.staff.resetPassword(
      this.shopOf(request),
      parsed.data,
      body.newPassword,
      new Date(),
      this.actorOf(request),
    );
    return { ok: true };
  }

  private shopOf(request: DashboardRequest): StaffTenant {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return { id: tenant.id, planLimits: tenant.planLimits };
  }

  /** The acting staff member, or null for the owner's own session (AUD-02). */
  private actorOf(request: DashboardRequest): string | null {
    return request.session?.userId ?? null;
  }
}

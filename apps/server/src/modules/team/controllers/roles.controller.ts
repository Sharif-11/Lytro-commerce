import { Permission } from '@lytronix/validators';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { roleIdSchema } from '@lytronix/validators';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { RoleService } from '../../staff/services/role.service';
import type { RoleRecord, RoleSummary } from '../../staff/types/role';
import { CreateRoleDto, UpdateRoleDto } from '../dto/role.dto';
import { RoleDto, RoleSummaryListDto } from '../dto/role-response.dto';

// STF-07 to STF-09 over HTTP. Each route declares the permission it needs (STF-11).
@ApiTags('Roles')
@Controller('roles')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class RolesController {
  constructor(
    @Inject(RoleService) private readonly roles: RoleService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @RequirePermission(Permission.StaffRead)
  @ResponseMessage('RolesListed')
  @ApiOperation({ summary: "List the shop's roles" })
  @ZodResponse({ type: RoleSummaryListDto })
  list(@Req() request: DashboardRequest): Promise<RoleSummary[]> {
    return this.roles.list(this.shopOf(request));
  }

  @Post()
  @RequirePermission(Permission.StaffManage)
  @ResponseMessage('RoleCreated')
  @ApiOperation({ summary: 'Create a role' })
  @ApiBody({ type: CreateRoleDto })
  @ZodResponse({ type: RoleDto })
  create(
    @Body(new ZodValidationPipe(CreateRoleDto.schema)) body: CreateRoleDto,
    @Req() request: DashboardRequest,
  ): Promise<RoleRecord> {
    return this.roles.create(
      this.shopOf(request),
      body,
      this.actorOf(request),
      this.clientIp.resolve(request),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.StaffManage)
  @ResponseMessage('RoleUpdated')
  @ApiOperation({ summary: 'Update a role' })
  @ApiBody({ type: UpdateRoleDto })
  @ZodResponse({ type: RoleDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleDto.schema)) body: UpdateRoleDto,
    @Req() request: DashboardRequest,
  ): Promise<RoleRecord> {
    return this.roles.update(
      this.shopOf(request),
      this.roleId(id),
      body,
      this.actorOf(request),
      this.clientIp.resolve(request),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.StaffManage)
  @ResponseMessage('RoleDeleted')
  @ApiOperation({ summary: 'Delete a role (only if unheld)' })
  @ZodResponse({ type: OkDto })
  async remove(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.roles.remove(
      this.shopOf(request),
      this.roleId(id),
      this.actorOf(request),
      this.clientIp.resolve(request),
    );
    return { ok: true };
  }

  private roleId(id: string): string {
    const parsed = roleIdSchema.safeParse(id);
    if (!parsed.success) throw new ApiError('not_found', 'RoleNotFound', {});
    return parsed.data;
  }

  private shopOf(request: DashboardRequest): { id: string } {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return { id: tenant.id };
  }

  /** The acting staff member, or null for the owner's own session (AUD-02). */
  private actorOf(request: DashboardRequest): string | null {
    return request.session?.userId ?? null;
  }
}

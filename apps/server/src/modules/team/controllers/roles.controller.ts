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
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { RoleService } from '../../staff/services/role.service';
import type { RoleRecord, RoleSummary } from '../../staff/types/role';
import { CreateRoleDto, UpdateRoleDto } from '../dto/role.dto';

// STF-07 to STF-09 over HTTP. Role management is for the owner until permission checks land (slice 7, step 4).
@Controller('roles')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard)
export class RolesController {
  constructor(@Inject(RoleService) private readonly roles: RoleService) {}

  @Get()
  list(@Req() request: DashboardRequest): Promise<RoleSummary[]> {
    return this.roles.list(this.shopOf(request));
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateRoleDto.schema)) body: CreateRoleDto,
    @Req() request: DashboardRequest,
  ): Promise<RoleRecord> {
    this.requireOwner(request);
    return this.roles.create(this.shopOf(request), body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleDto.schema)) body: UpdateRoleDto,
    @Req() request: DashboardRequest,
  ): Promise<RoleRecord> {
    this.requireOwner(request);
    return this.roles.update(this.shopOf(request), this.roleId(id), body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    this.requireOwner(request);
    await this.roles.remove(this.shopOf(request), this.roleId(id));
    return { ok: true };
  }

  private roleId(id: string): string {
    const parsed = roleIdSchema.safeParse(id);
    if (!parsed.success) throw new ApiError('not_found', 'Role not found.', {});
    return parsed.data;
  }

  private shopOf(request: DashboardRequest): { id: string } {
    const tenant = request.tenant;
    if (!tenant)
      throw new ApiError('forbidden', 'Create your shop to continue.', { next: 'create-shop' });
    return { id: tenant.id };
  }

  private requireOwner(request: DashboardRequest): void {
    if (request.session?.userId !== null) {
      throw new ApiError('forbidden', 'Only the owner manages roles.', {});
    }
  }
}

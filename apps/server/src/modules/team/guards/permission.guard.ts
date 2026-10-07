import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { REQUIRED_PERMISSION } from '../../../common/decorators/require-permission';
import type { DashboardRequest } from '../../identity/guards/dashboard.guard';
import { StaffService } from '../../staff/services/staff.service';

/**
 * Checks the permission a route requires (STF-10, STF-11). The permissions are read on every request, so a change to a
 * role applies to the next call without a new sign-in. Runs after the session and dashboard guards.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DashboardRequest>();
    const session = request.session;
    if (!session) throw new ApiError('unauthenticated', 'Sign in to continue.', {});
    // The owner's own session holds every permission.
    if (session.userId === null) return true;

    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    // A route without a declared permission is refused for staff: it fails closed.
    if (!required) throw new ApiError('forbidden', 'You do not have permission for this.', {});

    const tenant = request.tenant;
    if (!tenant)
      throw new ApiError('forbidden', 'Create your shop to continue.', { next: 'create-shop' });
    const held = await this.staff.permissionsOf(
      { id: tenant.id, planLimits: tenant.planLimits },
      session.userId,
    );
    if (held === null) throw new ApiError('unauthenticated', 'Sign in to continue.', {});
    if (!held.includes(required)) {
      throw new ApiError('forbidden', 'You do not have permission for this.', {
        permission: required,
      });
    }
    return true;
  }
}

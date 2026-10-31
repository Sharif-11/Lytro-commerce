import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OWNER_ONLY_PERMISSIONS, type Permission } from '@lytronix/validators';
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
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    // The owner's own session holds every permission.
    if (session.userId === null) return true;

    const required = this.reflector.getAllAndOverride<
      Permission | readonly Permission[] | undefined
    >(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    // A route without a declared permission is refused for staff: it fails closed.
    if (!required) throw new ApiError('forbidden', 'PermissionDenied', {});

    const anyOf: readonly Permission[] = typeof required === 'string' ? [required] : required;
    // WAL-07, STF-07 (amended 2026-10-31): a route only the owner's permissions open is the owner's alone.
    if (anyOf.every((permission) => OWNER_ONLY_PERMISSIONS.includes(permission))) {
      throw new ApiError('forbidden', 'OwnerOnlyAction', {});
    }

    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    const held = await this.staff.permissionsOf(
      { id: tenant.id, planLimits: tenant.planLimits },
      session.userId,
    );
    if (held === null) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    if (!anyOf.some((permission) => held.includes(permission))) {
      throw new ApiError('forbidden', 'PermissionDenied', {
        permission: typeof required === 'string' ? required : [...required],
      });
    }
    return true;
  }
}

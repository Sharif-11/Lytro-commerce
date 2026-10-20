import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@lytronix/validators';

export const REQUIRED_PERMISSION = Symbol('REQUIRED_PERMISSION');

/**
 * The permission a staff member must hold to call the route (STF-11), or a list of which any one will do -- for a route
 * whose exact need depends on what is asked, which the route then checks itself. The owner holds every permission.
 */
export const RequirePermission = (
  permission: Permission | readonly Permission[],
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_PERMISSION, permission);

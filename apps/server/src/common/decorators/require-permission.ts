import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@lytronix/validators';

export const REQUIRED_PERMISSION = Symbol('REQUIRED_PERMISSION');

/** The permission a staff member must hold to call the route (STF-11). The owner holds every permission. */
export const RequirePermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);

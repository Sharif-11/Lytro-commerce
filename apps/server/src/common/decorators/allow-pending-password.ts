import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';

/** Marks a route that a session still owing a password may call (AUTH-19). Every other route refuses it. */
export const AllowPendingPassword = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PENDING_PASSWORD, true);

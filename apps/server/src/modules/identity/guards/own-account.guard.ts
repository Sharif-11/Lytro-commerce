import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { isStaffSignIn } from '../services/staff-sign-in';
import type { SessionRequest } from './session.guard';

/**
 * TEN-31, AUTH-20, AUTH-26: a route that changes the person's own account -- its password, its sign-in methods, a shop
 * opened in its name -- refuses a staff sign-in. The shop's owner knows that password, having set the first one and
 * every reset (STF-01, STF-13), so such a session acts in that shop only and never on the account the person opens
 * their own shops with (KNOWN-GAPS §96). Placed after SessionGuard, and before DashboardGuard, which narrows the
 * person's own sign-in to their staff row on an employer's page.
 */
@Injectable()
export class OwnAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const session = context.switchToHttp().getRequest<SessionRequest>().session;
    if (session && isStaffSignIn(session)) {
      throw new ApiError('forbidden', 'OwnAccountNeedsOwnSignIn', {});
    }
    return true;
  }
}

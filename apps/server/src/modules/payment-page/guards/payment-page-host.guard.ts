import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';

/** PAY-23: the page's routes answer only on its own host, never through another host's `/api`. */
@Injectable()
export class PaymentPageHostGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ paymentPageHost?: boolean }>();
    if (request.paymentPageHost !== true) throw new ApiError('not_found', 'PageNotFound');
    return true;
  }
}

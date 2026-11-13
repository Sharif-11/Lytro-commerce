import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { RequestContext } from './request-context';

/** Where the guards leave the shop a request is for. Kept loose so this file does not depend on their types. */
interface ShopRequest {
  /** TenantGuard and DashboardGuard: the shop, or null on an account-level route. */
  tenant?: { id: string } | null;
  /** The public key's guard and the payment page's. */
  apiShop?: { row: { id: string } };
}

/**
 * LOG-01 (Slice 9.6): every log line a request writes names its shop. Runs after every guard, so it reads the shop
 * whichever guard found it (a shop's host, the dashboard's header, a public key, a payment page) and puts it in the
 * request's context, where the logger reads it. Lines written before (a guard's own) carry the request's ID only.
 */
@Injectable()
export class ShopLogContext implements NestInterceptor {
  constructor(@Inject(RequestContext) private readonly requests: RequestContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest<ShopRequest>();
      this.requests.setShop(request.tenant?.id ?? request.apiShop?.row.id ?? null);
    }
    return next.handle();
  }
}

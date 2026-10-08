import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { headerValue } from '../../../common/http';
import { CSRF_HEADER } from '../../identity/guards/session.guard';
import { OperatorAuthService } from '../services/operator-auth.service';
import type { OperatorSessionRecord } from '../ports/operator-gateway';

const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface OperatorSessionRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  operatorSession?: OperatorSessionRecord;
}

/** Requires a live operator session cookie (ADM-01). A tenant credential never reaches past here. */
@Injectable()
export class OperatorSessionGuard implements CanActivate {
  constructor(@Inject(OperatorAuthService) private readonly operators: OperatorAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OperatorSessionRequest>();
    const session = await this.operators.resolve(headerValue(request.headers.cookie));
    if (!session) throw new ApiError('unauthenticated', 'Sign in to continue.', {});

    const csrf = headerValue(request.headers[CSRF_HEADER]);
    if (MUTATING_METHODS.has(request.method) && !this.operators.csrfMatches(session, csrf)) {
      throw new ApiError('forbidden', 'Request not accepted.', {});
    }

    request.operatorSession = session;
    return true;
  }
}

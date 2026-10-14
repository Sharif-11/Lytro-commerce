import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../../../common/api-error';
import { ALLOW_PENDING_PASSWORD } from '../../../common/decorators/allow-pending-password';
import { headerValue } from '../../../common/http';
import type { SessionRecord } from '../ports/session-store';
import { SessionService } from '../services/session.service';

export const CSRF_HEADER = 'x-csrf-token';

const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface SessionRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  session?: SessionRecord;
}

/** Requires a live session cookie (D1). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const session = await this.sessions.resolve(headerValue(request.headers.cookie));
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});

    const csrf = headerValue(request.headers[CSRF_HEADER]);
    if (MUTATING_METHODS.has(request.method) && !this.sessions.csrfMatches(session, csrf)) {
      throw new ApiError('forbidden', 'RequestNotAccepted', {});
    }

    const allowedWhilePending = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_PENDING_PASSWORD,
      [context.getHandler(), context.getClass()],
    );
    if (session.mustSetPassword && !allowedWhilePending) {
      throw new ApiError('forbidden', 'SetPasswordToContinue', { next: 'set-password' });
    }

    request.session = session;
    return true;
  }
}

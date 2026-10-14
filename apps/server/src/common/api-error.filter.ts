import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@lytronix/shared-types';
import { ApiError, HTTP_STATUS } from './api-error';
import { headerValue, type HttpRequest } from './http';
import { resolveLanguage } from './i18n/accept-language';
import { translate } from './i18n/messages';

// The subset of the HTTP response this filter uses, so the file does not depend on Express types.
interface HttpResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

const logger = new Logger('UnhandledException');

// A generic Nest guard exception (ForbiddenException, NotFoundException, ...) carries a status but not one
// of this app's ErrorCode values. One representative code per status it's plausible for a guard to throw --
// good enough for a client branching on `errors.code`, since the `message` string is still the real detail.
const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'validation_error',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
  503: 'service_unavailable',
};

function messageOf(body: unknown): string {
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(' ');
  }
  return 'Request failed.';
}

/**
 * Renders every failure as the documented envelope (SRS-detailed §2.6): { success: false, statusCode,
 * message, errors: { code, details } }, with Retry-After when a retry hint exists. Catches every exception
 * (SEC-16, P1-N03) — never lets a raw error message, stack trace or path reach a response body; the real
 * error goes to the server log instead, where a developer can read it without a client ever seeing it.
 * `message` is resolved per request (I18N-01, bn default) from the exception's MessageKey -- an ApiError
 * never carries a raw string across this boundary.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const request = host.switchToHttp().getRequest<HttpRequest>();
    const lang = resolveLanguage(headerValue(request.headers['accept-language']));

    if (exception instanceof ApiError) {
      if (exception.retryAfterSeconds !== undefined) {
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      }
      const statusCode = HTTP_STATUS[exception.code];
      const message = translate(exception.messageKey, lang, exception.params);
      response
        .status(statusCode)
        .json(this.body(statusCode, message, exception.code, exception.details));
      return;
    }

    // A guard's own HttpException (ForbiddenException, NotFoundException, ...) that isn't this app's
    // ApiError/MessageKey system -- a truly unexpected framework-level rejection (e.g. malformed JSON body),
    // not a deliberate, keyed one. Its message can't be localized since this app doesn't own the text; both
    // status and message pass through as-is, only the envelope shape is added.
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      response
        .status(statusCode)
        .json(
          this.body(
            statusCode,
            messageOf(exception.getResponse()),
            STATUS_TO_CODE[statusCode] ?? 'internal_error',
            {},
          ),
        );
      return;
    }

    logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : exception);
    response
      .status(HTTP_STATUS.internal_error)
      .json(
        this.body(
          HTTP_STATUS.internal_error,
          translate('SomethingWentWrong', lang),
          'internal_error',
          {},
        ),
      );
  }

  private body(
    statusCode: number,
    message: string,
    code: ErrorCode,
    details: Record<string, unknown>,
  ): ApiErrorBody {
    return { success: false, statusCode, message, errors: { code, details } };
  }
}

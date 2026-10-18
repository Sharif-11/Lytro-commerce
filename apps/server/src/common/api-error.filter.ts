import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody, ApiFieldError, ErrorCode } from '@lytronix/shared-types';
import {
  FieldProblemCode,
  fieldProblemMessage,
  validationSummary,
  type Language,
} from '@lytronix/validators';
import { ApiError, FieldsError, HTTP_STATUS, type InvalidField } from './api-error';
import { headerValue, type HttpRequest } from './http';
import { resolveLanguage } from './i18n/accept-language';
import type { MessageKey } from './i18n/message-key';
import { translate } from './i18n/messages';

// The subset of the HTTP response this filter uses, so the file does not depend on Express types.
interface HttpResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

const logger = new Logger('UnhandledException');

// A rejection from the framework or the body parser carries a status but none of this app's ErrorCode values.
// One representative code per status it's plausible for one to carry, for a client branching on `errors.code`.
const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'validation_error',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  405: 'not_found',
  409: 'conflict',
  413: 'validation_error',
  415: 'validation_error',
  429: 'rate_limited',
  503: 'service_unavailable',
};

// §2.6: the same rejections in words a person understands. The framework's own text ("Unexpected token } in
// JSON", "Cannot GET /api/v1/x") is never shown -- it's English-only and names internals.
const STATUS_TO_MESSAGE: Record<number, MessageKey> = {
  400: 'RequestNotReadable',
  401: 'SignInToContinue',
  403: 'PermissionDenied',
  404: 'PageNotFound',
  405: 'PageNotFound',
  413: 'RequestTooLarge',
  415: 'RequestNotReadable',
  429: 'TooManyRequests',
  503: 'SomethingWentWrong',
};

const SHARED_PROBLEMS: readonly FieldProblemCode[] = Object.values(FieldProblemCode);

// Postgres 22P02 (invalid_text_representation) -- a malformed UUID (or any other type Postgres can't parse)
// in a path/query value reaches the driver as a raw, unhandled error otherwise, crashing with a generic 500
// instead of the clean `not_found` every route already gives a well-formed but nonexistent id. Treating the
// two identically is correct, not just convenient: a malformed id can never match a real row either, and
// doing anything else would tell a caller "that at least looks like a valid id" -- a shape of information
// leak this app already avoids elsewhere (TEN-03's not_found-not-forbidden rule, the same reasoning).
function isInvalidInputSyntax(exception: unknown): boolean {
  const source = exception instanceof Error && exception.cause ? exception.cause : exception;
  if (typeof source !== 'object' || source === null) return false;
  const code = 'code' in source ? source.code : undefined;
  return code === '22P02';
}

/**
 * The status of a rejection made before any handler ran: a framework HttpException (an unknown route), or the
 * body parser's own error (malformed JSON, a body over API-26's limit), which marks itself `expose` with a 4xx.
 */
function clientErrorStatus(exception: unknown): number | null {
  if (exception instanceof HttpException) return exception.getStatus();
  if (typeof exception !== 'object' || exception === null) return null;
  const expose = 'expose' in exception ? exception.expose : undefined;
  const status = 'status' in exception ? exception.status : undefined;
  if (expose === true && typeof status === 'number' && status >= 400 && status < 500) return status;
  return null;
}

/**
 * Renders every failure as the documented envelope (SRS-detailed §2.6): { success: false, statusCode,
 * message, errors: { code, details } }, with Retry-After when a retry hint exists. Catches every exception
 * (SEC-16, P1-N03) — never lets a raw error message, stack trace or path reach a response body; the real
 * error goes to the server log instead, where a developer can read it without a client ever seeing it.
 * `message` is resolved per request (I18N-01, bn default) from the exception's MessageKey -- an ApiError
 * never carries a raw string across this boundary. A FieldsError's fields are each worded too (API-16).
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const request = host.switchToHttp().getRequest<HttpRequest>();
    const lang = resolveLanguage(headerValue(request.headers['accept-language']));

    if (exception instanceof FieldsError) {
      const statusCode = HTTP_STATUS[exception.code];
      const fields = exception.fields.map((field) => this.word(field, lang));
      response.status(statusCode).json(
        this.body(statusCode, validationSummary(fields, lang), exception.code, {
          ...exception.details,
          fields,
        }),
      );
      return;
    }

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

    const status = clientErrorStatus(exception);
    if (status !== null) {
      response
        .status(status)
        .json(
          this.body(
            status,
            translate(STATUS_TO_MESSAGE[status] ?? 'RequestNotAccepted', lang),
            STATUS_TO_CODE[status] ?? 'validation_error',
            {},
          ),
        );
      return;
    }

    if (isInvalidInputSyntax(exception)) {
      response
        .status(HTTP_STATUS.not_found)
        .json(this.body(HTTP_STATUS.not_found, translate('PageNotFound', lang), 'not_found', {}));
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

  /** API-16: one field, with the message a person reads next to it in their language. */
  private word(field: InvalidField, lang: Language): ApiFieldError {
    const limits = {
      ...(field.min !== undefined ? { min: field.min } : {}),
      ...(field.max !== undefined ? { max: field.max } : {}),
      ...(field.length !== undefined ? { length: field.length } : {}),
      ...(field.exclusive !== undefined ? { exclusive: field.exclusive } : {}),
    };
    let message: string;
    const sharedProblem = SHARED_PROBLEMS.find((code) => code === field.problem);
    if (field.messageKey !== undefined) {
      message = translate(field.messageKey, lang, field.params);
    } else if (sharedProblem !== undefined) {
      const wordedAs = 'wordedAs' in field ? field.wordedAs : undefined;
      message = fieldProblemMessage(
        { field: wordedAs ?? field.field, problem: sharedProblem, ...limits },
        lang,
      );
    } else {
      // Unreachable by InvalidField's types: a server-only problem always brings its own wording.
      message = translate('CheckHighlightedFields', lang);
    }
    return { field: field.field, problem: field.problem, message, ...limits };
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

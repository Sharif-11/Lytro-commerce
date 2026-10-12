import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import { ApiError, HTTP_STATUS } from './api-error';

// The subset of the HTTP response this filter uses, so the file does not depend on Express types.
interface HttpResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

const logger = new Logger('UnhandledException');

/**
 * Renders ApiError as the documented body, with Retry-After when a retry hint exists. Catches every other
 * exception too (SEC-16, P1-N03) — never lets a raw error message, stack trace or path reach a response body;
 * the real error goes to the server log instead, where a developer can read it without a client ever seeing it.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();

    if (exception instanceof ApiError) {
      if (exception.retryAfterSeconds !== undefined) {
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      }
      response.status(HTTP_STATUS[exception.code]).json({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      });
      return;
    }

    // A guard's own HttpException (ForbiddenException, NotFoundException, ...) — not this app's documented
    // error shape, but still a deliberate, known rejection, not an unhandled failure: its own status and body
    // carry nothing a stack trace or internal path would, so it passes through unchanged.
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : exception);
    response.status(HTTP_STATUS.internal_error).json({
      error: {
        code: 'internal_error',
        message: 'Something went wrong. Please try again.',
        details: {},
      },
    });
  }
}

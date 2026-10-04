import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { ApiError, HTTP_STATUS } from './api-error';

// The subset of the HTTP response this filter uses, so the file does not depend on Express types.
interface HttpResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

/** Renders ApiError as the documented body, with Retry-After when a retry hint exists. */
@Catch(ApiError)
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: ApiError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
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
  }
}

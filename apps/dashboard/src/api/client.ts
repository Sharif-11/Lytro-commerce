import {
  SHOP_HEADER,
  type ApiErrorBody,
  type ApiSuccessBody,
  type ErrorCode,
} from '@lytronix/shared-types';
import { DASHBOARD_PATHS } from '@lytronix/validators';

const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_HEADER = 'x-csrf-token';

/**
 * TEN-31: the shop a dashboard page belongs to -- the first segment of app.lytro.app/<shop>/..., unless that segment
 * is one of the dashboard's own pages (sign-in, checkout, ...), which are never a shop's slug (TEN-26).
 */
function shopOfPath(pathname: string): string | null {
  const first = pathname.split('/').find((segment) => segment !== '') ?? null;
  if (first === null) return null;
  const pages: readonly string[] = DASHBOARD_PATHS;
  return pages.includes(first) ? null : decodeURIComponent(first);
}

/** Mirrors the server's ApiError shape (apps/server/src/common/api-error.ts), on the client side. */
export class ApiClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown>,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /**
   * API-16: each invalid field's message, by field. The server sends `details.fields` as a list of
   * `{ field, problem, message }` (ApiFieldError), worded in the request's language.
   */
  fieldProblems(): Record<string, string> {
    const fields = this.details.fields;
    if (!Array.isArray(fields)) return {};
    const out: Record<string, string> = {};
    for (const entry of fields as unknown[]) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { field, message } = entry as { field?: unknown; message?: unknown };
      if (typeof field === 'string' && typeof message === 'string') out[field] = message;
    }
    return out;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Read at call time, not captured once — sign-in sets this well after the client is constructed. */
  getCsrfToken: () => string | null;
}

/**
 * A typed fetch wrapper for the one tenant session. Always sends cookies (SEC-14's cookie-based session) and
 * attaches the CSRF header on every mutating request.
 */
export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    // TEN-31: a call from a shop's page names that shop; the server checks the person belongs to it.
    const shop = shopOfPath(window.location.pathname);
    if (shop !== null) headers.set(SHOP_HEADER, shop);
    if (MUTATING_METHODS.has(method)) {
      const csrfToken = this.options.getCsrfToken();
      if (csrfToken !== null) headers.set(CSRF_HEADER, csrfToken);
    }

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      method,
      headers,
      credentials: 'include',
    });

    if (response.status === 204) return undefined as T;

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw this.toError(response, body);
    }
    // Every success response is wrapped in { success, statusCode, message, data } (SRS-detailed §2.6); this
    // is the one place that unwraps it.
    return (body as Partial<ApiSuccessBody<T>> | null)?.data as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  }

  patch<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  }

  private toError(response: Response, body: unknown): ApiClientError {
    const envelope = body as Partial<ApiErrorBody> | null;
    const retryAfter = response.headers.get('Retry-After');
    return new ApiClientError(
      envelope?.errors?.code ?? 'service_unavailable',
      // '' when the body didn't parse: errorMessage() then falls back to its own localized copy.
      envelope?.message ?? '',
      envelope?.errors?.details ?? {},
      response.status,
      retryAfter === null ? undefined : Number(retryAfter),
    );
  }
}

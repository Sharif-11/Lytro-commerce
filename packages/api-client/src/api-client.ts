import {
  SHOP_HEADER,
  type ApiErrorBody,
  type ApiSuccessBody,
  type ErrorCode,
} from '@lytronix/shared-types';

const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_HEADER = 'x-csrf-token';

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
  /**
   * TEN-31: the shop the current page belongs to, sent on every call so the server can check the person
   * belongs to it. Read at call time, since the page changes under a long-lived client. Absent for the
   * operator console, which never acts as a shop.
   */
  getShop?: () => string | null;
}

/**
 * A typed fetch wrapper for one browser session. Always sends cookies (SEC-14's cookie-based session) and
 * attaches the CSRF header on every mutating request.
 */
export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    const shop = this.options.getShop?.() ?? null;
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
    return this.request<T>(path, { method: 'POST', body: this.bodyOf(data) });
  }

  patch<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: this.bodyOf(data) });
  }

  put<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: this.bodyOf(data) });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  private bodyOf(data: unknown): string | undefined {
    return data === undefined ? undefined : JSON.stringify(data);
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

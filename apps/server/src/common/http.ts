// The parts of the HTTP request and response the handlers use. Kept loose so the code does not depend on Express types.
export interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

export interface HttpResponse {
  setHeader(name: string, value: string): unknown;
}

export function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

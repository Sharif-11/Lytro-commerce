import type { TFunction } from 'i18next';
import { ApiClientError, errorMessage } from '@lytronix/api-client';

/** API-16: each refused field's problem code, such as "taken", for a form that words one its own way. */
function codesOf(error: unknown): Record<string, string> {
  const fields = error instanceof ApiClientError ? error.details.fields : null;
  if (!Array.isArray(fields)) return {};
  const out: Record<string, string> = {};
  for (const each of fields as unknown[]) {
    if (typeof each !== 'object' || each === null) continue;
    const { field, problem } = each as { field?: unknown; problem?: unknown };
    if (typeof field === 'string' && typeof problem === 'string') out[field] = problem;
  }
  return out;
}

/**
 * What a refused write says to a form: each problem under the field it names, and the rest once in a banner, so a
 * field's problem isn't said twice. `shown` is the fields this form has; `code` is a field's problem code.
 */
export function problemsOf(
  error: unknown,
  t: TFunction,
  shown: readonly string[],
): {
  field: (name: string) => string | undefined;
  code: (name: string) => string | undefined;
  banner: string | null;
} {
  if (!error) return { field: () => undefined, code: () => undefined, banner: null };
  const problems = error instanceof ApiClientError ? error.fieldProblems() : {};
  const codes = codesOf(error);
  const onAField = Object.keys(problems).some((name) => shown.includes(name));
  return {
    field: (name) => problems[name],
    code: (name) => codes[name],
    banner: onAField ? null : errorMessage(error, t),
  };
}

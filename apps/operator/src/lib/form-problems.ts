import type { TFunction } from 'i18next';
import { ApiClientError, errorMessage } from '@lytronix/api-client';

/**
 * What a refused write says to a form: each problem under the field it names, and the rest once in a banner, so a
 * field's problem isn't said twice. `shown` is the fields this form has.
 */
export function problemsOf(
  error: unknown,
  t: TFunction,
  shown: readonly string[],
): { field: (name: string) => string | undefined; banner: string | null } {
  if (!error) return { field: () => undefined, banner: null };
  const problems = error instanceof ApiClientError ? error.fieldProblems() : {};
  const onAField = Object.keys(problems).some((name) => shown.includes(name));
  return {
    field: (name) => problems[name],
    banner: onAField ? null : errorMessage(error, t),
  };
}

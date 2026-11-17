import { expect } from 'vitest';

/**
 * Every message on the way down an error and its causes. Since Drizzle 0.44 a failed query is a DrizzleQueryError
 * ("Failed query: ...") with the database's own error as its `cause`, so what PostgreSQL said is one level down.
 */
function messagesOf(error: unknown): string[] {
  const messages: string[] = [];
  for (let at: unknown = error, depth = 0; at instanceof Error && depth < 5; depth += 1) {
    messages.push(at.message);
    at = at.cause;
  }
  return messages;
}

/** That `work` fails, and the error or one of its causes says `words` (a trigger's RAISE, say). */
export async function failsWith(work: Promise<unknown>, words: RegExp): Promise<void> {
  const failure: unknown = await work.then(
    () => null,
    (error: unknown) => error ?? new Error('rejected with nothing'),
  );
  expect(failure, `expected it to fail with ${String(words)}`).toBeInstanceOf(Error);
  expect(messagesOf(failure)).toContainEqual(expect.stringMatching(words));
}

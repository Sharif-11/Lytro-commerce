/** A text searched for inside a LIKE or ILIKE pattern, its `%`, `_` and `\` matched as themselves. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * True when an update would change nothing: every field left out. An empty SET is not valid SQL, so a repository
 * reads the row back instead, and a PATCH with no fields answers with the record as it stands.
 */
export function isEmptyPatch(patch: Record<string, unknown>): boolean {
  return Object.values(patch).every((value) => value === undefined);
}

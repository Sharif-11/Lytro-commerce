import { ApiClientError } from '@lytronix/api-client';

export interface InCombo {
  id: string;
  name: string;
}

/** The combos named by a delete the server refused for being inside them (PRD-13); none for any other failure. */
export function combosIn(error: unknown): InCombo[] {
  if (!(error instanceof ApiClientError) || error.status !== 409) return [];
  const combos = error.details.combos;
  return Array.isArray(combos) ? (combos as InCombo[]) : [];
}

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';

/**
 * A request's failure in one sentence (TENANT-DASHBOARD-DESIGN §9): the server's own wording, else the dashboard's
 * words for the error's kind. Those live in the default dictionary, whichever namespace the screen reads its own
 * words from.
 */
export function useErrorText(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback((error: unknown) => errorMessage(error, t), [t]);
}

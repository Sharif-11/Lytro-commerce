import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { isConnectionFailure } from '@/lib/connection';

/**
 * A request's failure in one sentence (TENANT-DASHBOARD-DESIGN §9): the server's own wording, else the dashboard's
 * words for the error's kind. A request that never reached the server says the connection is gone, not that something
 * went wrong (item 1.3). Those live in the default dictionary, whichever namespace the screen reads its own words from.
 */
export function useErrorText(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => (isConnectionFailure(error) ? t('errors.offline') : errorMessage(error, t)),
    [t],
  );
}

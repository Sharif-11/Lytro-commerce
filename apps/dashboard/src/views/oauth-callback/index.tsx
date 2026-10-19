import { useEffect } from 'react';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useOauthCallback } from '@/api/auth';
import { errorMessage } from '@/api/error-message';
import { ErrorBanner } from '@/components/ui/notice';
import { StepFrame } from '@/components/ui/step-frame';

// Each OAuth `state` is single-use server-side. StrictMode mounts twice in development and a per-instance
// ref does not survive that, so a module-level set keyed by `state` makes the exchange once per attempt.
const consumedStates = new Set<string>();

export function OauthCallback(): React.JSX.Element {
  const { t } = useTranslation();
  const { provider } = useParams({ from: '/auth/oauth/$provider/callback' });
  const search = useSearch({ from: '/auth/oauth/$provider/callback' });
  const callback = useOauthCallback();

  useEffect(() => {
    if (consumedStates.has(search.state)) return;
    consumedStates.add(search.state);
    callback.mutate({ provider, code: search.code, state: search.state });
  }, [callback, provider, search.code, search.state]);

  return (
    <StepFrame
      step="identity"
      title={t('oauth.title')}
      lead={t('oauth.lead')}
      footer={
        callback.isError ? (
          <Link to="/sign-in" search={{}} className="font-semibold text-brand-800 underline">
            {t('oauth.backToSignIn')}
          </Link>
        ) : null
      }
    >
      {callback.isError ? (
        <ErrorBanner message={errorMessage(callback.error, t)} />
      ) : (
        <div className="flex justify-center py-4">
          <svg
            className="h-8 w-8 animate-spin text-brand-700"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2Z"
            />
          </svg>
        </div>
      )}
    </StepFrame>
  );
}

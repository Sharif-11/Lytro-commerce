import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/components/auth-card';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';
import { tenantSession } from '@/session/tenant-session';
import { navigateForNextStep } from '@/session/next-step';
import type { OauthSignedIn } from '@/types/auth';

// The state/code pair the provider sent is single-use (OauthService.callback consumes it server-side) —
// this must fire exactly once per page load, hence the ref guard against React 18 StrictMode's double effect.
export function OauthCallback(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { provider } = useParams({ from: '/auth/oauth/$provider/callback' });
  const search = useSearch({ from: '/auth/oauth/$provider/callback' });
  const started = useRef(false);

  const callback = useMutation({
    mutationFn: () =>
      tenantSession.client.get<OauthSignedIn>(
        `/auth/oauth/${provider}/callback?code=${encodeURIComponent(search.code)}&state=${encodeURIComponent(search.state)}`,
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      navigateForNextStep(navigate, data.next);
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    callback.mutate();
  }, [callback]);

  return (
    <AuthCard title={t('auth.oauthCallback.title')} subtitle={t('auth.oauthCallback.subtitle')}>
      {callback.isError ? <ErrorBanner message={errorMessage(callback.error, t)} /> : null}
    </AuthCard>
  );
}

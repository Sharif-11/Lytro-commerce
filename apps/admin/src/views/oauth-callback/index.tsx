import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/components/auth-card';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';
import { tenantSession } from '@/session/tenant-session';
import { navigateForNextStep } from '@/session/next-step';
import type { OauthSignedIn } from '@/types/auth';

// A per-instance ref doesn't survive this: React 18 StrictMode (main.tsx) deliberately mounts every
// component twice in dev, and the second mount gets a fresh ref, not the first one's — so a ref guard alone
// still fires this effect twice. Each OAuth `state` is single-use server-side, so two concurrent requests
// race to consume it; the loser gets a clean error, but the winner's response (a fresh cookie + CSRF token)
// can still land out of order against whichever request's onSuccess the browser runs last, pairing a cookie
// from one attempt with a CSRF token from another — surfacing downstream as a bogus "please sign in again".
// A module-level set, keyed by `state`, survives the remount and makes this genuinely once-per-attempt.
const consumedStates = new Set<string>();

export function OauthCallback(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { provider } = useParams({ from: '/auth/oauth/$provider/callback' });
  const search = useSearch({ from: '/auth/oauth/$provider/callback' });

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
    if (consumedStates.has(search.state)) return;
    consumedStates.add(search.state);
    callback.mutate();
  }, [callback, search.state]);

  return (
    <AuthCard title={t('auth.oauthCallback.title')} subtitle={t('auth.oauthCallback.subtitle')}>
      {callback.isError ? <ErrorBanner message={errorMessage(callback.error, t)} /> : null}
    </AuthCard>
  );
}

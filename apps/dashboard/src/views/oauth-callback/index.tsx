import { useEffect } from 'react';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useOauthCallback } from '@/api/auth';
import { OnboardingFrame, Spinner, StepLinks } from '@/components/onboarding/frame';
import { Banner } from '@/components/ui/banner';
import { useErrorText } from '@/hooks/use-error-text';

// Each OAuth `state` is single-use server-side. StrictMode mounts twice in development and a per-instance
// ref does not survive that, so a module-level set keyed by `state` makes the exchange once per attempt.
const consumedStates = new Set<string>();

/** AUTH-24's return from Google or Facebook (the prototype's `ob-oauth`): a spinner while the server signs the person in. */
export function OauthCallback(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
  const { provider } = useParams({ from: '/auth/oauth/$provider/callback' });
  const search = useSearch({ from: '/auth/oauth/$provider/callback' });
  const callback = useOauthCallback();

  useEffect(() => {
    if (consumedStates.has(search.state)) return;
    consumedStates.add(search.state);
    callback.mutate({ provider, code: search.code, state: search.state });
  }, [callback, provider, search.code, search.state]);

  return (
    <OnboardingFrame title={t('oauthT')} lead={t('oauthL')}>
      {callback.isError ? <Banner tone="bad">{errorText(callback.error)}</Banner> : <Spinner />}
      <StepLinks>
        <Link to="/sign-in" search={{}}>
          {t('backSignIn')}
        </Link>
      </StepLinks>
    </OnboardingFrame>
  );
}

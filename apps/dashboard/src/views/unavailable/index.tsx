import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { buttonClass } from '@/components/ui/classes';
import { appConfig } from '@/lib/app-config';

/**
 * LIF-24's wording for a shop that is not available, with a support button and no reason. In the onboarding frame
 * until Slice 11.5 draws it as the prototype's `unavailable`, beside the Renew page.
 */
export function Unavailable(): React.JSX.Element {
  const { t } = useTranslation();
  const { t: tOnboarding } = useTranslation('onboarding');
  return (
    <OnboardingFrame title={t('shop.suspended.title')} lead={t('shop.suspended.lead')}>
      <a href={appConfig.contactUrl()} className={buttonClass('outline', 'md', true)}>
        {t('shop.suspended.contactSupport')}
      </a>
      <StepLinks>
        <Link to="/sign-in" search={{}}>
          {tOnboarding('backSignIn')}
        </Link>
      </StepLinks>
    </OnboardingFrame>
  );
}

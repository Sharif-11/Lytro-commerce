import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StepFrame } from '@/components/ui/step-frame';
import { appConfig } from '@/lib/app-config';

/** LIF-24's wording for a shop that is not available, with a support button and no reason. */
export function Unavailable(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <StepFrame
      title={t('shop.suspended.title')}
      lead={t('shop.suspended.lead')}
      footer={
        <Link to="/sign-in" search={{}} className="font-semibold text-brand-800 underline">
          {t('forgotPassword.backToSignIn')}
        </Link>
      }
    >
      <a href={appConfig.contactUrl()} className="block">
        <Button type="button" tone="outline">
          {t('shop.suspended.contactSupport')}
        </Button>
      </a>
    </StepFrame>
  );
}

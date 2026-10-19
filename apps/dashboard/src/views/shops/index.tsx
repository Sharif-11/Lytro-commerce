import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/me';
import { errorMessage } from '@/api/error-message';
import { ErrorBanner } from '@/components/ui/notice';
import { StepFrame } from '@/components/ui/step-frame';

/**
 * TEN-31: the landing after any sign-in. /me names the person's shop, so this goes straight there; with no
 * shop it goes to create-shop (AUTH-12). The picker for a person who belongs to several shops arrives with
 * the memberships field on /me; until then there is never more than one.
 */
export function Shops(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();

  useEffect(() => {
    if (!me.data) return;
    if (me.data.tenant) {
      void navigate({ to: '/$shop', params: { shop: me.data.tenant.slug }, replace: true });
    } else {
      void navigate({ to: '/create-shop', replace: true });
    }
  }, [me.data, navigate]);

  return (
    <StepFrame title={t('shops.title')}>
      {me.isError ? (
        <ErrorBanner message={errorMessage(me.error, t)} />
      ) : (
        <p className="text-[15px] text-neutral-700">{t('common.loading')}</p>
      )}
    </StepFrame>
  );
}

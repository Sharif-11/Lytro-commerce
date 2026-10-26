import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { BareFrame } from '@/components/onboarding/frame';
import { SignOutLink } from '@/components/sign-out-link';
import { buttonClass } from '@/components/ui/classes';
import { appConfig } from '@/lib/app-config';
import { useShell } from '@/shell/shell-context';

/**
 * Unavailable (TENANT-DASHBOARD-DESIGN §7.20, the prototype's `unavailable`, LIF-24): a suspended shop's owner sees why
 * not, never the reason, with Contact support, See balance -- the owner's Balance and Top up stay reachable, to settle
 * what is owed -- and Sign out. Staff of a suspended shop are refused by /me itself.
 */
export function Unavailable(): React.JSX.Element {
  const { t } = useTranslation('money');
  const { slug } = useShell();
  return (
    <BareFrame>
      <div className="rounded-card border border-line bg-surface px-6 py-8 text-center">
        <div className="flex justify-center text-neutral-400">
          <Icon name="lock" size={40} />
        </div>
        <h1 className="mt-3 text-[22px] font-bold">{t('unavTitle')}</h1>
        <p className="mt-2 text-[14px] text-fg-muted">{t('unavNote')}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a href={appConfig.contactUrl()} className={buttonClass('primary', 'md')}>
            {t('contactSupport')}
          </a>
          <Link
            to="/$shop/balance"
            params={{ shop: slug }}
            className={buttonClass('outline', 'md')}
          >
            {t('seeBalance')}
          </Link>
        </div>
      </div>
      <SignOutLink />
    </BareFrame>
  );
}

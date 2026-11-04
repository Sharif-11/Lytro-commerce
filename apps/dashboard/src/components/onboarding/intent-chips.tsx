import { useTranslation } from 'react-i18next';
import { useBillingTerms, usePlans } from '@/api/billing';
import { Icon } from '@/components/icon';
import { appConfig } from '@/lib/app-config';
import type { SignUpIntent } from '@/session/sign-up-intent';

/**
 * What the guest chose on the website, shown as chips (ONBOARDING-FLOW-DESIGN §2 step 1): the address they typed and
 * the plan they picked. Nothing holds the address yet -- create-shop checks it -- so the chip names it and promises
 * nothing (decided 2026-10-23).
 */
export function IntentChips({ intent }: { intent: SignUpIntent }): React.JSX.Element | null {
  const { t, i18n } = useTranslation('onboarding');
  const plans = usePlans();
  const terms = useBillingTerms();
  if (!intent.shop && !intent.planId) return null;

  const plan = plans.data?.find((item) => item.id === intent.planId) ?? null;
  const term = terms.data?.find((item) => item.id === intent.termId) ?? null;
  const chip =
    'inline-flex h-8 items-center gap-1.5 rounded-full border border-brand-200 bg-primary-soft px-3.5 text-[14px] font-medium text-brand-900';

  return (
    <div className="flex flex-wrap gap-2">
      {intent.shop ? (
        <span className={chip}>
          <Icon name="globe" size={16} />
          {t('yourLink', { host: appConfig.shopHost(intent.shop) })}
        </span>
      ) : null}
      {plan ? (
        <span className={chip}>
          {t('picked', {
            plan: term
              ? `${plan.name} · ${i18n.language === 'bn' ? term.labelBn : term.labelEn}`
              : plan.name,
          })}
        </span>
      ) : null}
    </div>
  );
}

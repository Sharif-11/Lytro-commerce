import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageToggle, PoweredByLytro, Wordmark } from '@lytronix/ui';
import { appConfig } from '@/lib/app-config';

export type OnboardingStep = 'identity' | 'shop' | 'checkout' | 'password' | 'setUp';

const STEP_ORDER: OnboardingStep[] = ['identity', 'shop', 'password', 'setUp'];

interface StepFrameProps {
  title: string;
  lead?: ReactNode;
  /** Which onboarding step this screen is; drives the three-segment progress bar. Omit for screens that
      are not part of the flow (staff sign-in, unavailable). */
  step?: OnboardingStep;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * The bare shell every onboarding screen renders in (ONBOARDING-FLOW-DESIGN.md §2, SITE-PAGES-DESIGN.md §3):
 * wordmark top-left, language toggle and "Need help?" top-right, a progress bar, one card per step on a
 * sunken background, "Powered by Lytro · Lytronix" at the foot. No marketing nav, so nothing pulls the
 * seller away mid-flow. Phone first: the card is edge to edge under 640 px.
 */
export function StepFrame({
  title,
  lead,
  step,
  children,
  footer,
}: StepFrameProps): React.JSX.Element {
  const { t } = useTranslation();
  const index = step ? STEP_ORDER.indexOf(step === 'checkout' ? 'shop' : step) : -1;

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50">
      <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <Wordmark height={26} />
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <a
            href={appConfig.contactUrl()}
            className="hidden min-h-10 items-center rounded-control px-3 text-[14px] font-semibold text-brand-800 hover:bg-brand-50 sm:inline-flex"
          >
            {t('frame.needHelp')}
          </a>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col px-0 pb-8 sm:px-4 sm:pt-4">
        {index >= 0 ? (
          <ol
            className="mb-4 flex gap-1.5 px-4 sm:px-0"
            aria-label={t('frame.progress', { current: index + 1, total: STEP_ORDER.length })}
          >
            {STEP_ORDER.map((item, i) => (
              <li key={item} className="flex-1">
                <span
                  className={`block h-1.5 rounded-full ${i <= index ? 'bg-brand-700' : 'bg-neutral-200'}`}
                />
                <span
                  className={`mt-1.5 block text-[11px] font-bold ${i <= index ? 'text-brand-800' : 'text-neutral-500'}`}
                >
                  {t(`frame.steps.${item}`)}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        <section className="flex-1 bg-white px-4 py-6 sm:rounded-sheet sm:border sm:border-line sm:px-7 sm:py-8 sm:shadow-card">
          <h1 className="heading text-[24px] text-ink sm:text-[28px]">{title}</h1>
          {lead ? <div className="mt-2 text-[15px] text-neutral-700">{lead}</div> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-[14px] text-neutral-700">{footer}</div> : null}
        </section>

        <p className="mt-6 flex items-center justify-center gap-1 text-[12px] text-neutral-700">
          <PoweredByLytro /> · Lytronix
        </p>
      </div>
    </main>
  );
}

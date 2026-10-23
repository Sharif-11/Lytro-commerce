import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';

/** The owner's four steps (AUTH-28): who they are, the shop (and its checkout), a password, the set-up questions. */
export type OnboardingStep = 0 | 1 | 2 | 3;

const STEPS: readonly OnboardingStep[] = [0, 1, 2, 3];

interface OnboardingFrameProps {
  /** Shown as the four-segment progress bar from the second step on; sign-in is everyone's door, so it has none. */
  step?: OnboardingStep;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  /** Under the card, before "Powered by Lytro". */
  foot?: ReactNode;
}

/** "Powered by Lytro" with the mark, at the foot of every page outside a shop (the prototype's `.powered`). */
function PoweredBy(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  return (
    <p className="flex items-center justify-center gap-1.5 p-2 text-[13px] text-fg-subtle">
      <Icon name="mark" size={16} />
      {t('poweredBy')}
    </p>
  );
}

/**
 * TENANT-DASHBOARD-DESIGN §6, the prototype's `obFrame`: one 480 px column with the Lytro wordmark (no shop exists
 * yet) and the language switch, the owner's progress, one white card with the step's title, and "Powered by Lytro".
 */
export function OnboardingFrame({
  step,
  title,
  lead,
  children,
  foot,
}: OnboardingFrameProps): React.JSX.Element {
  const { t, i18n } = useTranslation('onboarding');
  return (
    <div className="min-h-dvh bg-neutral-50 font-sans text-[14px] leading-[1.45] text-fg [html[lang=bn]_&]:leading-[1.6]">
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-4 px-4 pt-4 pb-8 sm:pt-10">
        <div className="flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-1.5 text-brand-700">
            <Icon name="mark" size={26} />
            <b className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-fg">
              lytro
            </b>
          </span>
          <button
            type="button"
            lang={i18n.language === 'bn' ? 'en' : 'bn'}
            aria-label={t('langToggleLabel')}
            onClick={() => {
              void i18n.changeLanguage(i18n.language === 'bn' ? 'en' : 'bn');
            }}
            className="h-8 rounded-full border border-line bg-surface px-2.5 text-[13px] font-semibold text-fg-muted"
          >
            {t('langToggle')}
          </button>
        </div>
        {step !== undefined && step > 0 ? (
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((each) => (
              <i
                key={each}
                className={[
                  'h-1 flex-1 rounded-full',
                  each < step ? 'bg-brand-300' : each === step ? 'bg-primary' : 'bg-neutral-200',
                ].join(' ')}
              />
            ))}
          </div>
        ) : null}
        <section className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-5">
          <div>
            <h1 className="text-[22px] leading-[1.3] font-bold">{title}</h1>
            {lead ? <p className="mt-1 text-[15px] text-fg-muted">{lead}</p> : null}
          </div>
          {children}
        </section>
        {foot}
        <PoweredBy />
      </main>
    </div>
  );
}

/**
 * The prototype's `bareWrap`: a 520 px column under the Lytro mark, for a page that is neither a step nor a shop's
 * (the shop picker).
 */
export function BareFrame({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="min-h-dvh bg-neutral-50 font-sans text-[14px] leading-[1.45] text-fg [html[lang=bn]_&]:leading-[1.6]">
      <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col gap-5 px-4 pt-8 pb-6 sm:px-6 lg:px-8 lg:pb-8">
        <div className="flex justify-center">
          <Icon name="mark" size={40} />
        </div>
        {children}
        <PoweredBy />
      </main>
    </div>
  );
}

/** The prototype's `.links`: the step's other ways on, one under another, centred. */
export function StepLinks({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1.5 text-[14px] [&_a]:font-medium [&_a]:text-primary [&_button]:font-medium [&_button]:text-primary">
      {children}
    </div>
  );
}

/** The prototype's `.spin`: a 40 px ring turning while a step waits on the server. */
export function Spinner(): React.JSX.Element {
  return (
    <div className="mx-auto size-10 animate-spin rounded-full border-4 border-neutral-100 border-t-primary motion-reduce:animate-none" />
  );
}

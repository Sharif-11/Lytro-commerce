import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import { useChoosePayAsYouGo } from '@/api/billing';
import { BareFrame } from '@/components/onboarding/frame';
import { SignOutLink } from '@/components/sign-out-link';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { ShopMark } from '@/components/ui/shop-mark';
import { useErrorText } from '@/hooks/use-error-text';
import { daysSince, formatLongDate } from '@/lib/dates';
import { LeadTo } from '@/shell/lead-to';
import { useShell } from '@/shell/shell-context';
import { TermChips } from '@/views/plan/change-plan';
import { termLabel } from '@/views/plan/figures';
import { HowToPaySheet } from '@/views/plan/how-to-pay-sheet';
import { PlanCard, PlanRow } from '@/views/plan/parts';
import { taka, useLimitLines } from '@/views/plan/words';
import { usePlanCatalogue } from '@/views/plan/use-catalogue';
import { ExportButton } from './export-button';

const LAPSED: readonly TenantState[] = [TenantState.Locked, TenantState.Archived];

/**
 * Renew (TENANT-DASHBOARD-DESIGN §7.20, the prototype's `renew` and `renew-archived`, LIF-11, LIF-12, LIF-15): a locked
 * or archived shop's one page, without the shell. How long ago the plan ended, and for an archived shop until when its
 * data is kept (`deletesAt`); the plans on a term, its own to renew; pay-as-you-go, which needs no payment; the export
 * (LIF-16); and Sign out. Paying or choosing pay-as-you-go reopens the shop, and the plan page follows.
 */
export function Renew(): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
  const { tenant, slug, showToast } = useShell();
  const catalogue = usePlanCatalogue(tenant.billingTerm?.id ?? null);
  const payg = useChoosePayAsYouGo();
  const limitLines = useLimitLines();
  const [choice, setChoice] = useState<string | null>(null);
  const chosen = catalogue.options.find((option) => option.planId === choice);

  if (!LAPSED.includes(tenant.state)) return <LeadTo slug={slug} page="plan" />;

  const archived = tenant.state === TenantState.Archived;
  const ended = daysSince(tenant.periodEnd) ?? 0;
  const keptUntil = tenant.deletesAt ? formatLongDate(tenant.deletesAt, i18n.language) : '';
  const note = !archived
    ? t('renewNote', { count: ended })
    : tenant.periodEnd
      ? t('renewNoteArchived', { count: ended, date: keptUntil })
      : t('renewNoteClosed', { date: keptUntil });
  const term = catalogue.term;
  const per =
    term && term.months > 1
      ? t('perTerm', { term: termLabel(term, i18n.language) })
      : t('perMonth');

  return (
    <BareFrame>
      <div className="text-center">
        <ShopMark
          shopName={tenant.shopName}
          slug={tenant.slug}
          logo={tenant.logo}
          size={40}
          className="mb-2.5"
        />
        <h1 className="text-[22px] font-bold">
          {tenant.shopName} · {archived ? t('renewTitleArchived') : t('renewTitle')}
        </h1>
        <p className="mt-2 text-[14px] text-fg-muted">{note}</p>
      </div>
      <TermChips
        terms={catalogue.terms}
        table={catalogue.table}
        termId={term?.id ?? null}
        onPick={catalogue.pickTerm}
      />
      {catalogue.error ? <Banner tone="bad">{errorText(catalogue.error)}</Banner> : null}
      <PlanRow>
        {catalogue.options.map((option) => {
          const own = option.move === 'renewal';
          return (
            <PlanCard
              key={option.planId}
              name={option.planName}
              price={taka(option.price)}
              per={per}
              lines={limitLines(catalogue.planOf(option.planId))}
              current={own}
              action={
                option.amount && term ? (
                  <Button
                    tone={own ? 'accent' : 'primary'}
                    size="sm"
                    wide
                    onClick={() => {
                      setChoice(option.planId);
                    }}
                  >
                    {own
                      ? t('renewFor', { amount: taka(option.amount) })
                      : t('takePlan', { plan: option.planName })}
                  </Button>
                ) : null
              }
            />
          );
        })}
      </PlanRow>
      <Button
        tone="outline"
        wide
        busy={payg.isPending}
        onClick={() => {
          payg.mutate();
        }}
      >
        {t('choosePayg')}
      </Button>
      {payg.isError ? <Banner tone="bad">{errorText(payg.error)}</Banner> : null}
      <ExportButton />
      <SignOutLink />
      {chosen && term ? (
        <HowToPaySheet
          option={chosen}
          termId={term.id}
          onClose={() => {
            setChoice(null);
          }}
          onDone={(message) => {
            setChoice(null);
            showToast(message);
          }}
        />
      ) : null}
    </BareFrame>
  );
}

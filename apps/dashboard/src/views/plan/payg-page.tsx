import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, planCardTaka } from '@lytronix/validators';
import { formatTakaExact } from '@lytronix/ui';
import { useBalance, useCurrentRates } from '@/api/balance';
import { useCloseShop, usePayAsYouGoPlan } from '@/api/billing';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Dialog } from '@/components/ui/dialog';
import { SectionHead } from '@/components/ui/page';
import { StatusTag } from '@/components/ui/status-tag';
import { formatMonth } from '@/lib/dates';
import { limitFigure, megabytes } from '@/lib/limits';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { usePaymentNotices } from '@/views/billing/notices';
import { PaymentBanner } from '@/views/billing/payment-banner';
import { AddonsCard } from '@/views/addons/addons-card';
import { HowToPaySheet } from './how-to-pay-sheet';
import { CurrentCard, Disclosure, TightStat, TightStats } from './parts';
import { useCardLines } from './card-lines';
import { OnThisPlan, PlanGrid, PlanOffer, TermPicker } from './plan-cards';
import { termLabel } from './figures';
import { taka } from './words';
import { usePaygFees } from './payg-fees';
import { usePlanCatalogue } from './use-catalogue';

/** One fee and what it is, a hairline above all but the first (the prototype's `.feeline`). */
function FeeLine({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-3 border-t border-line py-1.5 text-[14px] first:border-t-0">
      <span>{label}</span>
      {value}
    </div>
  );
}

/**
 * A pay-as-you-go shop's plan page (TENANT-DASHBOARD-DESIGN §7.12, the prototype's `plan-payg` as drawn 2026-10-26,
 * PYG-01): the fees this month and the balance, the fee rates with pay-as-you-go's own limits, the plan cards to take a
 * plan (the estimate of what each would cost waits for PYG-12), and closing the shop at the foot (PYG-09).
 */
export function PaygPage({ openPlanId }: { openPlanId: string | null }): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const navigate = useNavigate();
  const { tenant, viewer, slug, showToast } = useShell();
  const canManage = allows(viewer, [Permission.PaymentsManage]);
  const catalogue = usePlanCatalogue(null);
  const balance = useBalance({ enabled: allows(viewer, [Permission.BalanceRead]) });
  const payg = usePayAsYouGoPlan();
  const fees = usePaygFees();
  const rates = useCurrentRates();
  const notices = usePaymentNotices();
  const [choice, setChoice] = useState<string | null>(null);
  const chosen = catalogue.options.find((option) => option.planId === choice);

  // Usage's "To raise it" names a plan: how to take it opens once its price is read, and the link's mark is dropped.
  const asked = catalogue.options.find((option) => option.planId === openPlanId);
  useEffect(() => {
    if (!asked) return;
    if (canManage && asked.amount !== null) setChoice(asked.planId);
    void navigate({ to: '/$shop/plan', params: { shop: slug }, search: {}, replace: true });
  }, [asked, canManage, navigate, slug]);
  const [closing, setClosing] = useState(false);
  const term = catalogue.term;
  const cards = useCardLines(
    [payg.data, ...catalogue.options.map((option) => catalogue.planOf(option.planId))],
    rates.data,
  );
  const limits = payg.data?.limits;

  return (
    <ShellPage>
      {notices.plan ? <PaymentBanner notice={notices.plan} about="plan" /> : null}
      <div className="flex flex-col gap-section lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-columns">
        <div className="flex min-w-0 flex-col gap-section">
          <CurrentCard>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] text-fg-muted">{t('yourPlan')}</span>
              <StatusTag tone="ok">{t('active')}</StatusTag>
            </div>
            <h2 className="mt-0.5 mb-3 text-[24px] font-bold">{t('pyPlan')}</h2>
            <TightStats>
              <TightStat
                label={t('pyFeesMonth')}
                value={balance.data ? formatTakaExact(balance.data.feesThisMonth) : '—'}
                note={formatMonth(new Date().toISOString(), i18n.language)}
              />
              <TightStat
                label={t('stBalance')}
                value={balance.data ? formatTakaExact(balance.data.amount) : '—'}
                note={t('pyNoPeriod')}
              />
            </TightStats>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {allows(viewer, [Permission.BalanceManage]) ? (
                <Button
                  tone="accent"
                  onClick={() => {
                    void navigate({
                      to: '/$shop/balance',
                      params: { shop: slug },
                      search: { topup: 1 },
                    });
                  }}
                >
                  {t('topUp')}
                </Button>
              ) : null}
              <Link
                to="/$shop/billing"
                params={{ shop: slug }}
                className={buttonClass('ghost', 'md')}
              >
                {t('seeBilling')}
              </Link>
            </div>
          </CurrentCard>
          <Card>
            <h3 className="mb-1 text-[17px] font-semibold">{t('pyFeeRates')}</h3>
            <div className="mt-2">
              <FeeLine
                label={t('pyFeeOrder')}
                value={<b className="num">{t('pyFeeOrderV', { ...fees })}</b>}
              />
              <FeeLine label={t('pyFeeProduct')} value={<b className="num">{fees.product}</b>} />
              {limits ? (
                <FeeLine
                  label={[
                    t('lProducts', { n: limitFigure('products', limits.products) }),
                    t('lSeats', { n: limitFigure('staff', limits.staff) }),
                    limits.storage_mb == null ? null : megabytes(limits.storage_mb),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  value={<span className="text-[14px] text-fg-muted">{t('pyNoPeriod')}</span>}
                />
              ) : null}
            </div>
            <p className="mt-2 text-[14px] text-fg-muted">{t('pyFeeBalance')}</p>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-section">
          <AddonsCard />
          {viewer.isOwner ? (
            <Disclosure title={t('pyCloseTitle')}>
              <p className="mt-2 mb-3 text-[14px] text-fg-muted">{t('pyCloseNote')}</p>
              <Button
                tone="outline"
                size="sm"
                onClick={() => {
                  setClosing(true);
                }}
              >
                <span className="text-danger">{t('pyCloseBtn')}</span>
              </Button>
            </Disclosure>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <SectionHead>{t('changePlan')}</SectionHead>
        <TermPicker
          terms={catalogue.terms}
          table={catalogue.table}
          termId={term?.id ?? null}
          onPick={catalogue.pickTerm}
        />
        {catalogue.error ? <ErrorBanner error={catalogue.error} /> : null}
        <PlanGrid>
          {payg.data ? (
            <PlanOffer
              name={t('payg')}
              who={payg.data.description}
              price={planCardTaka(0)}
              card={cards.payg(payg.data)}
              mine
              hot={payg.data.suggested === true}
              start
              action={<OnThisPlan hot={payg.data.suggested === true} />}
            />
          ) : null}
          {catalogue.options.map((option) => {
            const plan = catalogue.planOf(option.planId);
            const hot = plan?.suggested === true;
            const months = term?.months ?? 1;
            return (
              <PlanOffer
                key={option.planId}
                name={option.planName}
                who={plan?.description ?? null}
                price={planCardTaka(Number(option.price) / months)}
                termNote={
                  months > 1 && term
                    ? `${taka(option.price)}${t('perTerm', { term: termLabel(term, i18n.language) })}`
                    : null
                }
                card={cards.of(plan)}
                hot={hot}
                action={
                  canManage && option.amount && term ? (
                    <Button
                      tone={hot ? 'accent' : 'outline'}
                      wide
                      onClick={() => {
                        setChoice(option.planId);
                      }}
                    >
                      {t('ux2.take', { p: option.planName })}
                    </Button>
                  ) : null
                }
              />
            );
          })}
        </PlanGrid>
      </div>
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
      <CloseShopDialog
        open={closing}
        shopName={tenant.shopName}
        onClose={() => {
          setClosing(false);
        }}
      />
    </ShellPage>
  );
}

/**
 * Close the shop (PYG-09, the prototype's `sh-close-shop`): what goes offline now, what is deleted after 60 days, that
 * a plan or pay-as-you-go brings it back (LIF-15), and Export the data first. Closing archives it at once, and the shell
 * turns to the Renew page.
 */
function CloseShopDialog({
  open,
  shopName,
  onClose,
}: {
  open: boolean;
  shopName: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const { slug } = useShell();
  const close = useCloseShop();
  return (
    <Dialog
      open={open}
      title={t('closeShopTitle', { shop: shopName })}
      onClose={onClose}
      actions={
        <>
          <Link
            to="/$shop/settings"
            params={{ shop: slug }}
            className={buttonClass('outline', 'md')}
          >
            {t('csExport')}
          </Link>
          <Button
            tone="danger"
            busy={close.isPending}
            onClick={() => {
              close.mutate(undefined, { onSuccess: onClose });
            }}
          >
            {t('csBtn')}
          </Button>
        </>
      }
    >
      <p>{t('csCons1')}</p>
      <p className="mt-4">{t('csCons2')}</p>
      <p className="mt-4">{t('csCons3')}</p>
      {close.isError ? (
        <div className="mt-3">
          <ErrorBanner error={close.error} />
        </div>
      ) : null}
    </Dialog>
  );
}

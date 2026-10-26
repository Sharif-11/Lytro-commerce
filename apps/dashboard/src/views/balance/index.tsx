import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LOW_BALANCE_AMOUNT, Permission } from '@lytronix/validators';
import { formatTaka, formatTakaExact } from '@lytronix/ui';
import { useBalance, useCurrentRates, useEssentialSms } from '@/api/balance';
import { useBillingPayments } from '@/api/billing';
import { useHome } from '@/api/home';
import { BareFrame } from '@/components/onboarding/frame';
import { Banner } from '@/components/ui/banner';
import { useErrorText } from '@/hooks/use-error-text';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { usePaymentNotices } from '@/views/billing/notices';
import { PaymentBanner } from '@/views/billing/payment-banner';
import { BalanceCard } from './balance-card';
import { RatesCard } from './rates-card';
import { Statement } from './statement';
import { TopUpSheet } from './top-up-sheet';

/**
 * Balance (TENANT-DASHBOARD-DESIGN §7.11, the prototype's `balance`): the balance card, the statement and, beside it from
 * 1024 px, the current rates. Above them, the banner that applies: a low balance with Top up (BAL-13), a top-up being
 * checked or rejected (read from the payments list, §7.13). A suspended shop's owner sees it without the shell, with
 * only the balance and Top up -- what settles what is owed (LIF-24, decided 2026-10-26) -- and the way back.
 */
export function BalanceView({ openTopUp }: { openTopUp: boolean }): React.JSX.Element {
  const { t } = useTranslation('money');
  const errorText = useErrorText();
  const { tenant, viewer, slug, showToast } = useShell();
  const suspended = tenant.suspended;
  const canTopUp = allows(viewer, [Permission.BalanceManage]);
  const canSeePayments = allows(viewer, [Permission.PaymentsRead]);
  const balance = useBalance();
  const sms = useEssentialSms({ enabled: !suspended });
  const rates = useCurrentRates({ enabled: !suspended });
  const home = useHome({ enabled: !suspended });
  const payments = useBillingPayments(null, { enabled: canSeePayments && !suspended });
  const notices = usePaymentNotices();
  const ratesCard = useRef<HTMLDivElement>(null);
  // The + menu's Top up arrives with the sheet open (§4.5).
  const [topUp, setTopUp] = useState(openTopUp && canTopUp);

  const data = balance.data;
  const low = data !== undefined && !data.frozen && Number(data.amount) < LOW_BALANCE_AMOUNT;
  const checking = home.data?.topUpsBeingChecked;
  const sheet =
    topUp && data ? (
      <TopUpSheet
        bounds={{ min: data.topUpMin, max: data.topUpMax }}
        rates={rates.data}
        onClose={() => {
          setTopUp(false);
        }}
        onDone={(message) => {
          setTopUp(false);
          showToast(message);
        }}
      />
    ) : null;
  const card = data ? (
    <BalanceCard
      balance={data}
      sms={sms.data}
      onTopUp={
        canTopUp
          ? () => {
              setTopUp(true);
            }
          : null
      }
      onRates={
        suspended
          ? null
          : () => {
              ratesCard.current?.scrollIntoView({ block: 'start' });
            }
      }
    />
  ) : null;
  const failure = balance.isError ? <Banner tone="bad">{errorText(balance.error)}</Banner> : null;

  if (suspended) {
    return (
      <BareFrame>
        <p className="text-[14px]">
          <Link to="/$shop" params={{ shop: slug }} className="font-medium text-primary">
            ← {t('backUnavailable')}
          </Link>
        </p>
        {failure}
        {card}
        {sheet}
      </BareFrame>
    );
  }

  return (
    <ShellPage>
      {low ? (
        <Banner
          tone="bad"
          action={
            canTopUp ? (
              <button
                type="button"
                className="font-semibold text-primary"
                onClick={() => {
                  setTopUp(true);
                }}
              >
                {t('topUp')}
              </button>
            ) : undefined
          }
        >
          {t('wLowBal', {
            amount: formatTakaExact(data.amount),
            floor: formatTaka(LOW_BALANCE_AMOUNT),
          })}
        </Banner>
      ) : null}
      {notices.topUp ? (
        <PaymentBanner notice={notices.topUp} about="topUp" />
      ) : !canSeePayments && checking && checking.count > 0 ? (
        <Banner tone="info">{t('tuPending', { amount: formatTaka(checking.amount) })}</Banner>
      ) : null}
      {failure}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {card}
          <Statement payments={payments.data?.pages[0]?.payments ?? []} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {rates.data ? <RatesCard ref={ratesCard} rates={rates.data} /> : null}
        </div>
      </div>
      {sheet}
    </ShellPage>
  );
}

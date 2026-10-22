import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useBalance, useCurrentRates, useEssentialSms } from '@/api/balance';
import { errorMessage } from '@lytronix/api-client';
import { ErrorBanner, formatTaka, Notice, Page } from '@lytronix/ui';
import { useMe } from '@/api/me';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { HeroCard } from './hero-card';
import { RatesCard } from './rates-card';
import { Statement } from './statement';
import { TopUpSheet } from './top-up-sheet';

/**
 * Balance (DASHBOARD-SECTIONS-DESIGN §2): the amount and the one thing to do first, then the statement, with
 * the current rates beside it from 900 px. Container: owns the queries and whether the top-up sheet is open.
 */
export function Balance({ openTopUp = false }: { openTopUp?: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const me = useMe();
  const canTopUp = hasPermission(me.data, Permission.BalanceManage);
  const balance = useBalance();
  const sms = useEssentialSms();
  const rates = useCurrentRates();
  // The + menu's Top up arrives with the sheet already open (TENANT-DASHBOARD-DESIGN §4.5).
  const [topUpOpen, setTopUpOpen] = useState(openTopUp && canTopUp);
  const [pendingTopUp, setPendingTopUp] = useState<string | null>(null);
  const toast = useToast();

  return (
    <Page>
      {balance.isError ? <ErrorBanner message={errorMessage(balance.error, t)} /> : null}
      {balance.data ? (
        <HeroCard
          balance={balance.data}
          sms={sms.data}
          canTopUp={canTopUp}
          onTopUp={() => {
            setTopUpOpen(true);
          }}
        />
      ) : null}
      {pendingTopUp ? (
        <Notice tone="warning">
          <b>{t('balance.pendingTopUp', { amount: formatTaka(pendingTopUp) })}</b>{' '}
          {t('balance.pendingTopUpNote')}
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        <Statement />
        <RatesCard rates={rates.data} />
      </div>

      <TopUpSheet
        open={topUpOpen}
        rates={rates.data}
        onClose={() => {
          setTopUpOpen(false);
        }}
        onSubmitted={(amount) => {
          setPendingTopUp(amount);
          toast.show(t('balance.submitted'));
        }}
      />
      <Toast message={toast.message} />
    </Page>
  );
}

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusTag } from '@/components/ui/status-tag';
import { Taka } from '@/components/ui/taka';
import type { BalanceSnapshot, EssentialSmsUsage } from '@/types/balance';

interface BalanceCardProps {
  balance: BalanceSnapshot;
  sms: EssentialSmsUsage | undefined;
  /** Top up, for whoever may (`balance:manage`); null hides it. */
  onTopUp: (() => void) | null;
  /** Current rates, below on a phone, beside from 1024 px; null where they cannot be read (a suspended owner). */
  onRates: (() => void) | null;
}

/**
 * The balance card (TENANT-DASHBOARD-DESIGN §7.11, the prototype's `balance`): the amount in 36 px, Frozen when it is
 * (BAL-08) with what reopens it, else this month's free SMS against the plan's as a bar, Top up and Current rates.
 */
export function BalanceCard({
  balance,
  sms,
  onTopUp,
  onRates,
}: BalanceCardProps): React.JSX.Element {
  const { t } = useTranslation('money');
  const limit = sms ? (sms.monthlyLimit ?? sms.totalLimit) : null;
  const used = sms ? (sms.monthlyLimit !== null ? sms.monthlyUsed : sms.totalUsed) : 0;
  const share = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] text-fg-muted">{t('balanceTitle')}</span>
        {balance.frozen ? <StatusTag tone="neutral">{t('frozen')}</StatusTag> : null}
      </div>
      <div className="num mt-1 mb-3 text-[36px] font-semibold tracking-[-0.02em]">
        <Taka amount={balance.amount} />
      </div>
      {balance.frozen ? (
        <p className="text-[14px] text-fg-muted">{t('frozenNote')}</p>
      ) : (
        <>
          {limit ? (
            <>
              <div className="flex justify-between gap-3 pb-1.5 text-[15px]">
                <span className="text-fg-muted">{t('freeSms')}</span>
                <span className="num font-medium">
                  {used} / {limit}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                <i
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${String(share)}%` }}
                />
              </div>
            </>
          ) : null}
          {onTopUp || onRates ? (
            <div className="mt-3.5 flex flex-wrap gap-2">
              {onTopUp ? (
                <Button tone="accent" onClick={onTopUp}>
                  {t('topUp')}
                </Button>
              ) : null}
              {onRates ? (
                <Button tone="ghost" onClick={onRates}>
                  {t('rates')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

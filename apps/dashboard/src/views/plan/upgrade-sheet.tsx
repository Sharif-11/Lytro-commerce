import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { daysUntil, formatTakaExact } from '@lytronix/ui';
import { useBalance } from '@/api/balance';
import {
  useConfirmUpgrade,
  usePlatformWallets,
  useQuoteUpgrade,
  useRefreshPrices,
} from '@/api/billing';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Kv, RadioMark } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { WalletStep } from '@/components/wallet-step';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonthYear } from '@/lib/dates';
import { sentenceCase } from '@/lib/limits';
import { walletNames, walletProviders } from '@/lib/wallet-marks';
import type { Plan, PlanPriceOption, UpgradeQuote } from '@/types/billing';
import { useShopAfterPayment } from './after-pay';
import { limitMoves, UPGRADE_LIMITS } from './figures';
import { changedAmount, taka } from './words';

interface UpgradeSheetProps {
  option: PlanPriceOption;
  termId: string;
  termLabel: string;
  termMonths: number;
  /** The plan the shop is on now, and the one it moves to, for the limits that change. */
  from: Plan | undefined;
  to: Plan | undefined;
  periodEnd: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Upgrade (TENANT-DASHBOARD-DESIGN §7.12, the prototype's `upgrade`, UPG-06, UPG-16): the new price, the credit for the
 * days not used, the amount due, the new period and the limits that change, then pay from the balance or by wallet. The
 * request is made on the tap with the amount shown; when the server works out another (a day of credit less), the sheet
 * says the new amount and asks again, nothing charged (`upgrade-amount-changed`, BIL-09).
 */
export function UpgradeSheet({
  option,
  termId,
  termLabel,
  termMonths,
  from,
  to,
  periodEnd,
  onClose,
  onDone,
}: UpgradeSheetProps): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
  const balance = useBalance();
  const wallets = usePlatformWallets();
  const quote = useQuoteUpgrade();
  const confirm = useConfirmUpgrade();
  const refreshPrices = useRefreshPrices();
  const shopAfterPayment = useShopAfterPayment();
  const [changed, setChanged] = useState<string | null>(null);
  const [opened, setOpened] = useState<UpgradeQuote | null>(null);

  const amount = changed ?? option.amount ?? '0';
  const credit = Number(option.credit ?? 0);
  const days = daysUntil(periodEnd) ?? 0;
  const available = balance.data && !balance.data.frozen ? Number(balance.data.amount) : null;
  const enough = available !== null && available >= Number(amount);
  const names = walletNames(wallets.data ?? [], i18n.language);
  const moves = from && to ? limitMoves(UPGRADE_LIMITS, from.limits, to.limits) : [];
  const limits = sentenceCase(
    moves.map((move) => t('limitMove', { limit: t(`lim.${move.key}`), ...move })).join(' · '),
  );
  const failure = quote.error ?? confirm.error;
  const refusal = failure && changedAmount(failure) === null ? errorText(failure) : null;

  function commit(method: 'balance' | 'wallet'): void {
    setChanged(null);
    quote.mutate(
      { planId: option.planId, billingTermId: termId, amount: Number(amount) },
      {
        onSuccess: (request) => {
          if (method === 'wallet') {
            setOpened(request);
            return;
          }
          confirm.mutate(
            { paymentId: request.id, method: 'balance' },
            {
              onSuccess: () => {
                void shopAfterPayment().then((tenant) => {
                  const end = tenant?.periodEnd ?? request.periodEnd;
                  onDone(t('plUpgraded', { plan: option.planName, date: formatDayMonthYear(end) }));
                });
              },
            },
          );
        },
        onError: (error) => {
          const now = changedAmount(error);
          if (now === null) return;
          setChanged(now);
          refreshPrices();
        },
      },
    );
  }

  if (opened) {
    return (
      <Sheet open title={t('upTitle', { plan: option.planName })} onClose={onClose}>
        <WalletStep
          amount={opened.amount}
          wallets={wallets.data}
          pending={confirm.isPending}
          error={confirm.isError ? errorText(confirm.error) : null}
          onSubmit={(values) => {
            confirm.mutate(
              { paymentId: opened.id, method: 'wallet', ...values },
              {
                onSuccess: () => {
                  onDone(t('sentForCheck'));
                },
              },
            );
          }}
        />
      </Sheet>
    );
  }

  const busy = quote.isPending || confirm.isPending;
  return (
    <Sheet
      open
      title={t('upTitle', { plan: option.planName })}
      onClose={onClose}
      footer={
        <>
          <Button
            tone="accent"
            busy={busy}
            disabled={!enough}
            onClick={() => {
              commit('balance');
            }}
          >
            {t('payFromBalance', { amount: taka(amount) })}
          </Button>
          <Button
            tone="outline"
            disabled={busy}
            onClick={() => {
              commit('wallet');
            }}
          >
            {t('payByWallet', { wallets: names })}
          </Button>
        </>
      }
    >
      {changed ? (
        <div className="mb-3">
          <Banner tone="warn">{t('amountChanged', { amount: taka(changed) })}</Banner>
        </div>
      ) : null}
      <Kv label={t('newPrice', { term: termLabel })} value={taka(option.price)} />
      {credit > 0 ? (
        <Kv
          label={t('credit', { count: days, plan: from?.name ?? '' })}
          value={<span className="text-success">−{taka(credit)}</span>}
        />
      ) : null}
      <Kv label={t('amountDue')} value={taka(amount)} total />
      <p className="text-[14px] text-fg-muted">
        {termMonths === 1 ? t('startsNow') : t('startsNowTerm', { term: termLabel })}
        {limits ? (
          <>
            <br />
            {limits}
          </>
        ) : null}
      </p>
      <div className="rounded-card border border-line bg-neutral-50 p-4">
        <div className="flex items-center gap-3" aria-hidden="true">
          <RadioMark on={enough} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium">
              {t('payFromBalance', { amount: taka(amount) })}
            </span>
            <span className="text-[14px] text-fg-muted">
              {available === null
                ? t('psBalanceLow', { wallets: names })
                : t('balanceHas', { amount: formatTakaExact(available) })}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3 pt-2.5" aria-hidden="true">
          <RadioMark on={!enough} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium">{t('payByWallet', { wallets: names })}</span>
            <span className="truncate text-[14px] text-fg-muted">
              {walletProviders(wallets.data ?? []).join(' · ')}
            </span>
          </span>
        </div>
      </div>
      <p className="text-[14px] text-fg-muted">{t('quoteValid')}</p>
      {refusal ? <Banner tone="bad">{refusal}</Banner> : null}
    </Sheet>
  );
}

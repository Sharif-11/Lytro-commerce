import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlanPaymentPageFrom } from '@lytronix/validators';
import { formatTaka } from '@lytronix/ui';
import { useQuoteTopUp } from '@/api/balance';
import { useOpenPaymentPage, usePlatformWallets } from '@/api/billing';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/ui/button';
import { chipClass } from '@/components/ui/classes';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { WalletMarks } from '@/components/wallet-marks';
import { openingTopUp, outsideTopUp, quickTopUps } from './top-up-words';

/** The sheet's two steps (the prototype's `.steps`): the amount here, then the payment page. */
function Steps(): React.JSX.Element {
  const { t } = useTranslation('money');
  const dot = (on: boolean) => (
    <i className={`inline-block size-2 rounded-full ${on ? 'bg-primary' : 'bg-neutral-300'}`} />
  );
  return (
    <div className="flex items-center gap-2 text-[13px] text-fg-muted">
      {dot(true)} {t('amount')} {dot(false)} {t('psPage')}
    </div>
  );
}

interface TopUpSheetProps {
  /** BAL-04: the lowest and highest amounts the platform takes now, said before the request. */
  bounds: { min: number; max: number };
  /** PF-41: the amount to open on, when a prompt names one -- else ৳50, within the bounds. */
  opensOn?: number;
  onClose: () => void;
}

/**
 * Top up (TENANT-DASHBOARD-DESIGN §7.11, BAL-03, BAL-04; the prototype's `ux-topup`): the amount and the quick amounts
 * ৳10–৳100 inside the platform's live bounds, nothing else to read (Fixes · UI/UX batch 2, items 4.1 and 4.4); an
 * amount outside the bounds says which are allowed. Continue makes the request with that amount (BIL-09) and opens the
 * payment page (§7.19). The banner on Balance then says it is being checked.
 */
export function TopUpSheet({ bounds, opensOn, onClose }: TopUpSheetProps): React.JSX.Element {
  const { t } = useTranslation('money');
  const wallets = usePlatformWallets();
  const quote = useQuoteTopUp();
  const openPage = useOpenPaymentPage();
  const [amount, setAmount] = useState(() => String(openingTopUp(bounds, opensOn)));
  const value = Number(amount.replace(/[^\d]/g, ''));
  const fits = !outsideTopUp(value, bounds);
  const title = t('topupTitle');

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      footer={
        <Button
          tone="accent"
          disabled={!fits}
          busy={quote.isPending || openPage.isPending || openPage.isSuccess}
          onClick={() => {
            quote.mutate(
              { amount: value },
              {
                onSuccess: (request) => {
                  openPage.mutate({
                    paymentId: request.id,
                    topUp: true,
                    from: PlanPaymentPageFrom.Balance,
                  });
                },
              },
            );
          }}
        >
          {t('goToPage', { amount: formatTaka(value) })}
        </Button>
      }
    >
      <Steps />
      <Field
        label={t('amount')}
        prefix="৳"
        inputMode="numeric"
        value={amount}
        error={
          amount !== '' && !fits
            ? t('ux2.topErr', {
                min: bounds.min.toLocaleString('en-US'),
                max: bounds.max.toLocaleString('en-US'),
              })
            : undefined
        }
        onChange={(event) => {
          setAmount(event.target.value.replace(/[^\d,]/g, ''));
        }}
      />
      <div className="flex flex-wrap gap-2">
        {quickTopUps(bounds).map((each) => (
          <button
            key={each}
            type="button"
            aria-pressed={value === each}
            className={`num ${chipClass(value === each)}`}
            onClick={() => {
              setAmount(String(each));
            }}
          >
            {formatTaka(each)}
          </button>
        ))}
      </div>
      <WalletMarks wallets={wallets.data ?? []} />
      {quote.isError ? <ErrorBanner error={quote.error} /> : null}
      {openPage.isError ? <ErrorBanner error={openPage.error} /> : null}
    </Sheet>
  );
}

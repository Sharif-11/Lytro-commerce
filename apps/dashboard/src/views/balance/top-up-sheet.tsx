import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlanPaymentPageFrom, RateKey } from '@lytronix/validators';
import { formatTaka } from '@lytronix/ui';
import { useQuoteTopUp } from '@/api/balance';
import { useOpenPaymentPage, usePlatformWallets } from '@/api/billing';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { chipClass } from '@/components/ui/classes';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { WalletMarks } from '@/components/wallet-marks';
import { useErrorText } from '@/hooks/use-error-text';
import type { RateValue } from '@/types/balance';

// The quick amounts the sketch offers, and the one it opens on.
const QUICK = [200, 500, 1000, 2000];
const OPENS_ON = 500;

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
  rates: RateValue[] | undefined;
  onClose: () => void;
}

/**
 * Top up (TENANT-DASHBOARD-DESIGN §7.11, BAL-03, BAL-04): the amount, with the quick amounts, what it buys in SMS at
 * today's rate and the platform's bounds; Continue makes the request with that amount (BIL-09) and opens the payment page
 * (§7.19). The banner on Balance then says it is being checked.
 */
export function TopUpSheet({ bounds, rates, onClose }: TopUpSheetProps): React.JSX.Element {
  const { t } = useTranslation('money');
  const errorText = useErrorText();
  const wallets = usePlatformWallets();
  const quote = useQuoteTopUp();
  const openPage = useOpenPaymentPage();
  const [amount, setAmount] = useState(String(OPENS_ON));
  const value = Number(amount.replace(/[^\d]/g, ''));
  const fits = value >= bounds.min && value <= bounds.max;
  const smsRate = Number(rates?.find((rate) => rate.key === RateKey.SmsPerUnit)?.value ?? 0);
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
        help={t('topupBounds', { min: formatTaka(bounds.min), max: formatTaka(bounds.max) })}
        onChange={(event) => {
          setAmount(event.target.value.replace(/[^\d,]/g, ''));
        }}
      />
      <div className="flex flex-wrap gap-2">
        {QUICK.map((each) => (
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
      {smsRate > 0 && value > 0 ? (
        <p className="text-[14px] text-fg-muted">
          {t('buys', { sms: Math.floor(value / smsRate).toLocaleString('en-US') })}
        </p>
      ) : null}
      <WalletMarks wallets={wallets.data ?? []} />
      <p className="text-[14px] text-fg-muted">{t('tuNotePage')}</p>
      {quote.isError ? <Banner tone="bad">{errorText(quote.error)}</Banner> : null}
      {openPage.isError ? <Banner tone="bad">{errorText(openPage.error)}</Banner> : null}
    </Sheet>
  );
}

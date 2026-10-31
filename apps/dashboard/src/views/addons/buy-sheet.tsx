import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AddonKind } from '@lytronix/validators';
import { formatTaka, formatTakaExact } from '@lytronix/ui';
import { ADDONS_QUERY_KEY, usePurchaseAddon, useQuoteAddon } from '@/api/addons';
import { useBalance } from '@/api/balance';
import { usePlatformWallets } from '@/api/billing';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Kv, RadioMark } from '@/components/ui/kv';
import { Quantity } from '@/components/ui/quantity';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { WalletMarks } from '@/components/wallet-marks';
import { WalletStep } from '@/components/wallet-step';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { walletNames, walletProviders } from '@/lib/wallet-marks';
import { useShell } from '@/shell/shell-context';
import type { AddonOffer, AddonQuote } from '@/types/addons';
import type { UsageFigure } from '@/types/usage';
import { changedAmount } from '@/views/plan/words';
import { boughtToast, limitChange, limitMove, nameOf } from './addon-words';

interface BuySheetProps {
  /** The add-on, as GET /addons prices it now. */
  offer: AddonOffer;
  /** The shop's own figures, for the limit before and after. */
  figures: readonly UsageFigure[];
  /** On pay-as-you-go an add-on runs its own 30 days and renews from the balance. */
  payg: boolean;
  onClose: () => void;
  /** It went through or was sent for checking: the toast to end on. */
  onDone: (message: string) => void;
}

/**
 * Buy an add-on (TENANT-DASHBOARD-DESIGN §7.25, the prototype's `sh-addon-buy`): how many, the limit before and after,
 * due now for the days left -- the server's own amount for that many -- and then what it renews for; from the balance
 * (on at once) or by the platform's wallets, whose step opens in the sheet until Phase 5's page; the renewal switch,
 * sent with the request. The request is made only on the tap that commits, with the amount shown (BIL-09).
 */
export function BuySheet({
  offer,
  figures,
  payg,
  onClose,
  onDone,
}: BuySheetProps): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { slug } = useShell();
  const balance = useBalance();
  const wallets = usePlatformWallets();
  const quote = useQuoteAddon();
  const purchase = usePurchaseAddon();
  const [quantity, setQuantity] = useState(1);
  const [renews, setRenews] = useState(true);
  const [changed, setChanged] = useState<string | null>(null);
  const [method, setMethod] = useState<'balance' | 'wallet' | null>(null);
  const [opened, setOpened] = useState<AddonQuote | null>(null);

  const addon = offer.addon;
  const name = nameOf(addon, i18n.language);
  const amount = changed ?? String(offer.amounts[quantity - 1] ?? offer.price ?? 0);
  const available = balance.data && !balance.data.frozen ? Number(balance.data.amount) : null;
  const enough = available !== null && available >= Number(amount);
  const chosen = enough ? (method ?? 'balance') : 'wallet';
  const names = walletNames(wallets.data ?? [], i18n.language);
  const move = limitMove(addon, quantity, figures);
  const then = formatTaka((offer.renewalPrice ?? Number(addon.price)) * quantity);
  const failure = quote.error ?? purchase.error;
  const refusal = failure && changedAmount(failure) === null ? errorText(failure) : null;

  function commit(): void {
    setChanged(null);
    quote.mutate(
      { addonId: addon.id, quantity, amount: Number(amount), renews },
      {
        onSuccess: (made) => {
          if (chosen === 'wallet') {
            setOpened(made);
            return;
          }
          purchase.mutate(
            { paymentId: made.payment.id, method: 'balance' },
            {
              onSuccess: (result) => {
                onDone(
                  boughtToast(
                    {
                      addon,
                      move,
                      invoice: result.invoice
                        ? { number: result.invoice.number, amount: result.invoice.amount }
                        : null,
                    },
                    t,
                    i18n.language,
                  ),
                );
              },
            },
          );
        },
        onError: (error) => {
          const now = changedAmount(error);
          if (now === null) return;
          setChanged(now);
          void queryClient.invalidateQueries({ queryKey: ADDONS_QUERY_KEY });
        },
      },
    );
  }

  if (opened) {
    return (
      <Sheet
        open
        title={t('psTitle', { amount: formatTaka(opened.payment.amount) })}
        onClose={onClose}
      >
        <WalletStep
          amount={opened.payment.amount}
          wallets={wallets.data}
          pending={purchase.isPending}
          error={purchase.isError ? errorText(purchase.error) : null}
          amountNote={t('abAmountNote')}
          onSubmit={(values) => {
            purchase.mutate(
              { paymentId: opened.payment.id, method: 'wallet', ...values },
              {
                onSuccess: () => {
                  onDone(t('abSent'));
                },
              },
            );
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      title={t('abTitle', { name })}
      onClose={onClose}
      footer={
        <Button busy={quote.isPending || purchase.isPending} onClick={commit}>
          {chosen === 'balance'
            ? t('abBtn', { amount: formatTaka(amount) })
            : t('continueAmount', { amount: formatTaka(amount) })}
        </Button>
      }
    >
      {changed ? (
        <div className="mb-3">
          <Banner tone="warn">{t('amountChanged', { amount: formatTaka(changed) })}</Banner>
        </div>
      ) : null}
      {addon.kind === AddonKind.Feature ? null : (
        // The sketch's 52 px row: its two lines from the sheet's top edge, 8 px under them.
        <div className="-mt-1 flex min-h-11 items-center gap-3 pb-2">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium">{t('abQty')}</span>
            <span className="text-[14px] text-fg-muted">
              {t('abEach', { amount: formatTaka(addon.price) })}
            </span>
          </span>
          <Quantity
            value={quantity}
            most={offer.amounts.length}
            label={t('abQty')}
            onChange={(next) => {
              setQuantity(next);
              setChanged(null);
            }}
          />
        </div>
      )}
      {move ? <Kv label={t('abLimit')} value={limitChange(move, t)} /> : null}
      <Kv label={t('abNow')} value={formatTaka(amount)} total />
      <p className="num text-[14px] text-fg-muted">
        {payg
          ? t('abNowNotePayg', {
              date: offer.expiresAt ? formatDayMonth(offer.expiresAt) : '',
              amount: then,
            })
          : t('abNowNote', {
              count: offer.daysLeft ?? 0,
              date: offer.expiresAt ? formatDayMonth(offer.expiresAt) : '',
              amount: then,
            })}
      </p>
      <div
        role="radiogroup"
        className="mt-3 flex flex-col rounded-card border border-line bg-neutral-50 p-4"
      >
        <button
          type="button"
          role="radio"
          aria-checked={chosen === 'balance'}
          aria-disabled={!enough}
          onClick={() => {
            if (enough) setMethod('balance');
          }}
          className={`flex min-h-16 w-full items-center gap-3 text-left ${enough ? '' : 'cursor-default opacity-55'}`}
        >
          <RadioMark on={chosen === 'balance'} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium">{t('abBalance')}</span>
            <span className="text-[14px] text-fg-muted">
              {available === null
                ? t('abNotEnough')
                : `${t('psBalanceHas', { amount: formatTakaExact(available) })}${enough ? '' : ` · ${t('abNotEnough')}`}`}
            </span>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={chosen === 'wallet'}
          onClick={() => {
            setMethod('wallet');
          }}
          className="flex min-h-16 w-full items-center gap-3 pt-2.5 text-left"
        >
          <RadioMark on={chosen === 'wallet'} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium">{t('abWallet', { wallets: names })}</span>
            <span className="truncate text-[14px] text-fg-muted">
              {walletProviders(wallets.data ?? []).join(' · ')}
            </span>
          </span>
        </button>
      </div>
      <div className="mt-3 empty:hidden">
        <WalletMarks wallets={wallets.data ?? []} />
      </div>
      {available !== null && !enough ? (
        <div className="mt-3">
          <Banner
            tone="bad"
            action={
              <Link
                to="/$shop/balance"
                params={{ shop: slug }}
                search={{ topup: 1 }}
                className="text-primary"
              >
                {t('topUp')}
              </Link>
            }
          >
            {t('abLow', {
              balance: formatTakaExact(available),
              amount: formatTaka(amount),
              wallets: names,
            })}
          </Banner>
        </div>
      ) : null}
      <div className="flex min-h-11 items-center gap-3 py-1.5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-medium">
            {payg ? t('abRenewRowBal') : t('abRenewRow')}
          </span>
          {payg ? null : <span className="text-[14px] text-fg-muted">{t('aoRenews')}</span>}
        </span>
        <Switch
          checked={renews}
          label={payg ? t('abRenewRowBal') : t('abRenewRow')}
          onChange={setRenews}
        />
      </div>
      {refusal ? <Banner tone="bad">{refusal}</Banner> : null}
    </Sheet>
  );
}

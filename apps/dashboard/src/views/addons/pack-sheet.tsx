import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UsageMetric } from '@lytronix/validators';
import { formatTaka, formatTakaExact } from '@lytronix/ui';
import { ADDONS_QUERY_KEY, useBuyPacks } from '@/api/addons';
import { useBalance } from '@/api/balance';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Kv, RadioMark } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import type { AddonOffer } from '@/types/addons';
import type { ShopUsage } from '@/types/usage';
import { AutoBuyCard } from '@/views/usage/auto-buy-card';
import { changedAmount } from '@/views/plan/words';
import { invoiceNumber } from '@/views/billing/payment-words';
import { nameOf, packMetric } from './addon-words';

interface PackSheetProps {
  /** The packs on sale, as GET /addons prices them. */
  packs: AddonOffer[];
  /** The pack to open on: the one Usage's link named. */
  metric: 'bandwidth' | 'requests';
  usage: ShopUsage | undefined;
  canManage: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Buy a pack (TENANT-DASHBOARD-DESIGN §7.25, the prototype's `sh-pack-buy`): the two packs, each adding once and
 * carried over until used; from the balance only, so a short balance says so with Top up; the auto-buy switches. The
 * purchase carries the price shown and is refused when it changed since (BIL-09).
 */
export function PackSheet({
  packs,
  metric,
  usage,
  canManage,
  onClose,
  onDone,
}: PackSheetProps): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { slug } = useShell();
  const balance = useBalance();
  const buy = useBuyPacks();
  const [chosen, setChosen] = useState<string>(
    () =>
      packs.find(
        (each) =>
          packMetric(each.addon) ===
          (metric === 'requests' ? UsageMetric.Requests : UsageMetric.Bandwidth),
      )?.addon.id ??
      packs[0]?.addon.id ??
      '',
  );
  const [changed, setChanged] = useState<string | null>(null);
  const offer = packs.find((each) => each.addon.id === chosen);
  const amount = changed ?? String(offer?.price ?? 0);
  const available = balance.data && !balance.data.frozen ? Number(balance.data.amount) : null;
  const short = available !== null && available < Number(amount);
  const refusal = buy.error && changedAmount(buy.error) === null ? errorText(buy.error) : null;

  function commit(): void {
    if (!offer) return;
    setChanged(null);
    buy.mutate(
      { addonId: offer.addon.id, quantity: 1, amount: Number(amount) },
      {
        onSuccess: (result) => {
          const added = t('pkBought', { name: nameOf(offer.addon, i18n.language) });
          onDone(
            result.invoice
              ? `${added} · ${t('abInvoice', {
                  number: invoiceNumber(result.invoice.number, t),
                  amount: formatTaka(result.invoice.amount),
                })}`
              : added,
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

  return (
    <Sheet
      open
      title={t('pkTitle')}
      onClose={onClose}
      footer={
        <Button disabled={!offer || short || !canManage} busy={buy.isPending} onClick={commit}>
          {t('abBtn', { amount: formatTaka(amount) })}
        </Button>
      }
    >
      {changed ? (
        <div className="mb-3">
          <Banner tone="warn">{t('amountChanged', { amount: formatTaka(changed) })}</Banner>
        </div>
      ) : null}
      <div role="radiogroup" className="-mx-4 flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
        {packs.map((each) => {
          const on = each.addon.id === chosen;
          return (
            <button
              key={each.addon.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setChosen(each.addon.id);
                setChanged(null);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">
                  {nameOf(each.addon, i18n.language)}
                </span>
                <span className="mt-0.5 block text-[13px] text-fg-muted">{t('aoPackCarry')}</span>
              </span>
              <span className="num font-bold whitespace-nowrap">
                {formatTaka(on && changed ? changed : (each.price ?? each.addon.price))}
              </span>
              <RadioMark on={on} />
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[14px] text-fg-muted">{t('pkNote')}</p>
      <Kv
        label={t('psBalanceHas', { amount: available === null ? '—' : formatTakaExact(available) })}
        value={formatTaka(amount)}
        total
      />
      {short ? (
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
            {t('pkLow', { balance: formatTakaExact(available), amount: formatTaka(amount) })}
          </Banner>
        </div>
      ) : null}
      {usage ? (
        <div className="mt-3">
          <AutoBuyCard usage={usage} canManage={canManage} help="pkCap" inSheet />
        </div>
      ) : null}
      {refusal ? <Banner tone="bad">{refusal}</Banner> : null}
    </Sheet>
  );
}

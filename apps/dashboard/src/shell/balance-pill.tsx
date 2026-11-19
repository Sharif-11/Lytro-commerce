import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTakaExact } from '@lytronix/ui';
import { useHome } from '@/api/home';
import { useShell } from './shell-context';

/** How long a tapped balance shows before it hides again, as bKash's does. */
export const BALANCE_SHOWN_MS = 5000;

/**
 * The balance in the top bar, as bKash shows it (the owner, 2026-11-19, the sketch's `bb-*`): hidden behind "ব্যালেন্স
 * দেখুন"; a tap shows it for 5 seconds, then it hides again; a tap on the amount while it shows opens Balance. Only the
 * balance, no word about it; its colour says it instead: amber when low (BAL-13, the line Home and the low-balance
 * email use), red at ৳0 or below. Only for whoever may see the balance: Home sends none otherwise.
 */
export function BalancePill({ size }: { size: 'sm' | 'lg' }): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const { slug } = useShell();
  const navigate = useNavigate();
  const balance = useHome().data?.balance ?? null;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const hide = window.setTimeout(() => {
      setShown(false);
    }, BALANCE_SHOWN_MS);
    return () => {
      window.clearTimeout(hide);
    };
  }, [shown]);

  if (balance === null) return null;
  const amount = Number(balance.amount);
  const tone =
    amount <= 0
      ? 'bg-danger-soft border-transparent text-danger-text [&>.tk]:bg-danger'
      : balance.low
        ? 'bg-warning-soft border-transparent text-warning [&>.tk]:bg-warning'
        : 'bg-surface border-line text-fg [&>.tk]:bg-primary';
  const sized =
    size === 'lg'
      ? `h-10 gap-2 text-[14px] [&>.tk]:size-[30px] [&>.tk]:text-[16px] ${shown ? 'pr-[5px] pl-3.5' : 'pr-3.5 pl-[5px]'}`
      : `mt-[3px] h-[26px] gap-[5px] self-start text-[12.5px] [&>.tk]:size-[21px] [&>.tk]:text-[12px] ${shown ? 'pr-0.5 pl-[9px]' : 'pr-[9px] pl-0.5'}`;
  const tk = (
    <span className="tk inline-grid flex-none place-items-center rounded-full font-bold text-white">
      ৳
    </span>
  );
  return (
    <button
      type="button"
      aria-label={shown ? `${t('balance')} ${formatTakaExact(balance.amount)}` : t('seeBalance')}
      onClick={() => {
        if (shown) {
          void navigate({ to: '/$shop/balance', params: { shop: slug } });
        } else {
          setShown(true);
        }
      }}
      className={`inline-flex flex-none items-center rounded-full border font-semibold whitespace-nowrap transition-[padding] duration-200 ${sized} ${tone}`}
    >
      {shown ? (
        <>
          <span className="num" aria-live="polite">
            {formatTakaExact(balance.amount)}
          </span>
          {tk}
        </>
      ) : (
        <>
          {tk}
          <span>{t('seeBalance')}</span>
        </>
      )}
    </button>
  );
}

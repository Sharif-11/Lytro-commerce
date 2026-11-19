import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTakaExact } from '@lytronix/ui';
import { Permission } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import type { BalanceShort } from '@/lib/balance-gate';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';

/**
 * Why a button is greyed out (the owner, 2026-11-19, the sketch's `bg-note`): the balance is not sufficient, what the
 * action needs and what the balance holds, and Top up for whoever may add to it.
 */
export function BalanceNote({
  short,
  what,
  id,
  className,
}: {
  short: BalanceShort;
  /** The action, as the sentence starts: "প্রোডাক্ট যোগ করতে" / "Adding a product". */
  what: string;
  /** For the greyed-out button's aria-describedby. */
  id?: string;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug, viewer } = useShell();
  return (
    <div
      id={id}
      role="note"
      className={[
        'flex flex-wrap items-start gap-2 rounded-[10px] bg-warning-soft px-3 py-2.5 text-[14px] leading-[1.45] text-fg-muted',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="mt-0.5 flex-none text-warning">
        <Icon name="banknote" size={16} />
      </span>
      <span className="min-w-[180px] flex-1">
        <b className="text-fg">{t('bgNot')}</b>{' '}
        {t('bgNeeds', {
          what,
          need: formatTakaExact(short.need.toFixed(2)),
          have: formatTakaExact(short.have.toFixed(2)),
        })}
      </span>
      {allows(viewer, [Permission.BalanceManage]) ? (
        <Link
          to="/$shop/balance"
          params={{ shop: slug }}
          search={{ topup: 1 }}
          className="font-semibold whitespace-nowrap text-primary"
        >
          {t('bgTopUp')}
        </Link>
      ) : null}
    </div>
  );
}

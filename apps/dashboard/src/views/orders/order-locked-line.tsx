import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Permission } from '@lytronix/validators';
import { useBalance } from '@/api/balance';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Chip } from '@/components/ui/chips';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { useUnlockPrices } from './order-access';

/**
 * PYG-22 (PAYG-FAIR-USE-PLAN PF-25, the sketch's `pf-list`): with locked orders waiting, a chip that shows only them and a
 * line that counts them, names the price and the balance -- or, with nothing in the balance, says orders keep coming but
 * need a top-up. Nothing when none is locked.
 */
export function LockedLine({
  locked,
  on,
  onChip,
}: {
  locked: number;
  on: boolean;
  onChip: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { slug, viewer } = useShell();
  const balance = useBalance({ enabled: locked > 0 && allows(viewer, [Permission.BalanceRead]) });
  const prices = useUnlockPrices();
  if (locked === 0 && !on) return null;
  const amount = balance.data ? Number(balance.data.amount) - Number(balance.data.held) : null;
  const empty = amount !== null && amount <= 0;
  const topUp = (
    <Link to="/$shop/balance" params={{ shop: slug }} search={{ topup: 1 }}>
      {t('fair.listTopUp')}
    </Link>
  );
  return (
    <>
      <div>
        <Chip on={on} onClick={onChip} count={locked}>
          <Icon name="lock" size={15} />
          {t('fair.lockedChip')}
        </Chip>
      </div>
      {locked === 0 ? null : empty ? (
        <Banner tone="bad" action={topUp}>
          <b>{t('fair.listEmptyT', { balance: formatTaka(0) })}</b> {t('fair.listEmptyB')}
        </Banner>
      ) : (
        <Banner tone="info" icon="lock" action={topUp}>
          <b>{t('fair.listTopT', { count: locked })}</b>{' '}
          {t('fair.listTopB', {
            phone: prices.phone,
            confirm: prices.confirm,
            balance: amount === null ? '…' : formatTaka(amount),
          })}
        </Banner>
      )}
    </>
  );
}

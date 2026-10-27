import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useUsage } from '@/api/usage';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { Dialog } from '@/components/ui/dialog';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { SeatUsage } from '@/types/staff';
import { seatFullText, seatWays } from './team-words';

/** What needed the seat: adding someone, or reactivating someone by name. */
export type SeatAsk = { kind: 'add' } | { kind: 'reactivate'; name: string };

/**
 * STF-02, STF-04 (the prototype's `team-full-add`, `team-full-add-nopay` and `sh-staff-reactivate-full`): no seat is
 * free, so the ways out come at once -- for someone who may pay, the next plan and a seat from the shop's usage; for
 * anyone else, the one they can take.
 */
export function SeatFullDialog({
  ask,
  seats,
  onClose,
}: {
  ask: SeatAsk | null;
  seats: SeatUsage | undefined;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug, viewer } = useShell();
  const canPay =
    allows(viewer, [Permission.PaymentsManage]) && allows(viewer, [Permission.PaymentsRead]);
  const usage = useUsage({ enabled: ask !== null && canPay });
  const ways = seatWays(usage.data);
  const ready = !canPay || !usage.isPending;
  const total = seats?.total ?? seats?.used ?? 0;
  return (
    <Dialog
      open={ask !== null && ready}
      title={t('stFullTitle')}
      onClose={onClose}
      actions={
        canPay ? (
          <>
            <Link
              to="/$shop/plan"
              params={{ shop: slug }}
              search={{ plan: ways.plan?.planId }}
              className={buttonClass(ways.seat ? 'outline' : 'primary')}
            >
              {t('stSeePlans')}
            </Link>
            {ways.seat ? (
              <Link
                to="/$shop/addons"
                params={{ shop: slug }}
                search={{ buy: ways.seat.key }}
                className={buttonClass('primary')}
              >
                {t('stBuySeat')}
              </Link>
            ) : null}
          </>
        ) : (
          <Button onClick={onClose}>{t('done')}</Button>
        )
      }
    >
      {ask ? seatFullText(ask, { used: seats?.used ?? total, total }, ways, canPay, t) : null}
    </Dialog>
  );
}

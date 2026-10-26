import { useTranslation } from 'react-i18next';
import { useChoosePayAsYouGo } from '@/api/billing';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { sentenceCase } from '@/lib/limits';
import type { Plan } from '@/types/billing';
import { limitMoves, PAYG_LIMITS } from './figures';
import type { PaygFees } from './payg-fees';

interface PaygSwitchSheetProps {
  periodEnd: string;
  from: Plan | undefined;
  payg: Plan | undefined;
  fees: PaygFees;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Switch to pay-as-you-go (TENANT-DASHBOARD-DESIGN §7.12, the prototype's `sh-payg-switch`, PYG-10): the date, the fees,
 * the limits that fall from the plan's to pay-as-you-go's own, and what happens to what is over them.
 */
export function PaygSwitchSheet({
  periodEnd,
  from,
  payg,
  fees,
  onClose,
  onDone,
}: PaygSwitchSheetProps): React.JSX.Element {
  const { t } = useTranslation('money');
  const errorText = useErrorText();
  const choose = useChoosePayAsYouGo();
  const date = formatDayMonth(periodEnd);
  const moves = from && payg ? limitMoves(PAYG_LIMITS, from.limits, payg.limits) : [];
  const list = sentenceCase(
    moves.map((move) => t('limitMove', { limit: t(`lim.${move.key}`), ...move })).join(' · '),
  );

  return (
    <Sheet
      open
      title={t('pgTitle')}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('keep')}
          </Button>
          <Button
            busy={choose.isPending}
            onClick={() => {
              choose.mutate(undefined, { onSuccess: onDone });
            }}
          >
            {t('pgBtn', { date })}
          </Button>
        </>
      }
    >
      <p className="text-[15px]">{t('pgWhen', { date })}</p>
      <div className="my-2.5 rounded-card border border-line bg-neutral-50 p-4">
        <p className="text-[14px]">{t('pgFees', { ...fees })}</p>
      </div>
      {list ? <p className="text-[14px] text-fg-muted">{t('pgLimits', { list })}</p> : null}
      <p className="mt-2 text-[14px] text-fg-muted">{t('pgOverNote')}</p>
      {choose.isError ? <Banner tone="bad">{errorText(choose.error)}</Banner> : null}
    </Sheet>
  );
}

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { PlatformSettingKey, ReconciliationDifferenceState } from '@lytronix/validators';
import { useDegradedMode, useTurnDegradedMode } from '@/api/degraded-mode';
import { useDifferenceCount } from '@/api/reconciliation';
import { useSettings } from '@/api/settings';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { ConsoleCard } from '@/components/ui/console-page';
import { CardList, LIST_ROW, RowIcon } from '@/components/ui/list-row';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { formatSessionTime } from '@/lib/session-time';

const TEXT = 'text-[14px] leading-[1.5] text-neutral-700';
const DEGRADED_MODE: string = PlatformSettingKey.DegradedMode;

/**
 * DAT-38, D9-14, DAT-52 (Slice 9.9): degraded mode -- "Limited mode" to the operator -- on Today: whether it is on, since
 * when and by whom, what it divides by, and the switch, each way confirmed by a panel that says what changes. Under it,
 * the money check's open differences, opening their page.
 */
export function LimitedModeCard(): React.JSX.Element | null {
  const { t } = useTranslation();
  const toast = useToast();
  const mode = useDegradedMode();
  const settings = useSettings();
  const open = useDifferenceCount(ReconciliationDifferenceState.Open);
  const turn = useTurnDegradedMode();
  const [asking, setAsking] = useState<'on' | 'off' | null>(null);
  if (!mode.data) return null;
  const { on, factor } = mode.data;
  // Who changed the switch last, and when: the setting's own record.
  const record = settings.data?.find((setting) => setting.key === DEGRADED_MODE);
  const since = record ? formatSessionTime(record.updatedAt) : '—';
  const detail = on
    ? record?.updatedByEmail
      ? t('today.limited.onDetail', { t: since, by: record.updatedByEmail })
      : t('today.limited.onDetailSince', { t: since })
    : t('today.limited.offDetail');
  const openCount = open.data ?? 0;

  function confirm(next: boolean): void {
    turn.mutate(next, {
      onSuccess: () => {
        toast(t(next ? 'today.limited.onToast' : 'today.limited.offToast'));
        setAsking(null);
      },
    });
  }

  return (
    <ConsoleCard className={on ? 'border-warning' : ''}>
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`flex size-10 flex-none items-center justify-center rounded-[10px] ${
            on ? 'bg-warning-soft text-warning' : 'bg-neutral-100 text-ink'
          }`}
        >
          <ConsoleIcon name="signal" />
        </span>
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold">{t('today.limited.title')}</h2>
            <StatusChip tone={on ? 'warn' : 'ok'}>
              {t(on ? 'today.limited.on' : 'today.limited.off')}
            </StatusChip>
          </div>
          <div className={TEXT}>{detail}</div>
          <div className="text-[14px] leading-[1.5] font-semibold text-ink">
            {t('today.limited.factor', { n: factor })} ·{' '}
            <Link to="/settings" hash="settings-group-16" className="text-primary underline">
              {t('today.limited.factorGo')}
            </Link>
          </div>
        </div>
        <Button
          type="button"
          tone="outline"
          small
          fit
          className={`${SMALL_BUTTON} flex-none`}
          onClick={() => {
            setAsking(on ? 'off' : 'on');
          }}
        >
          {t(on ? 'today.limited.turnOff' : 'today.limited.turnOn')}
        </Button>
      </div>
      <CardList>
        <Link to="/money-check" className={LIST_ROW}>
          <RowIcon name="receipt" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium whitespace-normal">
              {t('today.limited.money')} ·{' '}
              <b className={openCount > 0 ? 'text-warning' : ''}>
                {openCount > 0
                  ? t('today.limited.moneyOpen', { n: openCount })
                  : t('today.limited.moneyNone')}
              </b>
            </span>
            <span className={`${TEXT} whitespace-normal`}>{t('today.limited.moneyDetail')}</span>
          </span>
          <ConsoleIcon name="chev" size={18} className="flex-none text-neutral-500" />
        </Link>
      </CardList>
      {asking === 'on' ? (
        <ActionPanel
          title={t('today.limited.onTitle')}
          sub={t('today.limited.onSub')}
          onClose={() => {
            setAsking(null);
          }}
          actionLabel={t('today.limited.turnOn')}
          pending={turn.isPending}
          error={turn.isError ? errorMessage(turn.error, t) : null}
          onSubmit={() => {
            confirm(true);
          }}
        >
          <Consequence tone="danger">
            <b>{t('today.limited.pauses')}</b>
            <br />
            {t('today.limited.pausesList')}
          </Consequence>
          <Consequence tone="ok">
            <b>{t('today.limited.keeps')}</b>
            <br />
            {t('today.limited.keepsList')}
          </Consequence>
          <div className={TEXT}>
            {t('today.limited.limits', { n: factor })} {t('today.limited.factorWhere')}
          </div>
          <div className={TEXT}>{t('today.limited.told')}</div>
        </ActionPanel>
      ) : null}
      {asking === 'off' ? (
        <ActionPanel
          title={t('today.limited.offTitle')}
          sub={t('today.limited.offSub', { t: since })}
          onClose={() => {
            setAsking(null);
          }}
          actionLabel={t('today.limited.turnOff')}
          pending={turn.isPending}
          error={turn.isError ? errorMessage(turn.error, t) : null}
          onSubmit={() => {
            confirm(false);
          }}
        >
          <div className={TEXT}>{t('today.limited.offBody')}</div>
        </ActionPanel>
      ) : null}
    </ConsoleCard>
  );
}

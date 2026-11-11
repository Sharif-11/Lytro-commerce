import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { PlanPaymentKind } from '@lytronix/validators';
import { Banner } from '@/components/ui/banner';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { Panel } from '@/components/ui/panel';
import { NOTE, SMALL_BUTTON } from '@/components/ui/sizes';
import { formatDay, taka } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import type { ManualEntry } from '@/types/manual-entries';
import { shotGone, usePaidTo } from './entry-words';

/** ADM-16: one entry's facts, its reason and its evidence; Reverse, unless it was. */
export function EntryPanel({
  entry,
  reversal,
  onClose,
  onShot,
  onReverse,
}: {
  entry: ManualEntry;
  /** The entry reversing this one, when the list holds it: it names who reversed it. */
  reversal: ManualEntry | undefined;
  onClose: () => void;
  onShot: () => void;
  onReverse: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const paidTo = usePaidTo();
  const bank = entry.bankAccountId !== null;
  const canReverse = entry.reversedBy === null && entry.reversesEntryId === null;

  return (
    <Panel
      open
      title={`${t(`paymentKinds.${entry.kind}`)} · ${taka(entry.amount)}`}
      sub={`${entry.shopName} · ${formatSessionTime(entry.createdAt)}`}
      onClose={onClose}
      footerInRow
      footer={
        <>
          <Button
            type="button"
            tone="outline"
            small
            fit
            className="flex-1 sm:flex-none"
            onClick={onClose}
          >
            {t('common.close')}
          </Button>
          {canReverse ? (
            <Button
              type="button"
              tone="outline"
              small
              fit
              className="flex-1 text-danger! sm:flex-none"
              onClick={onReverse}
            >
              <ConsoleIcon name="undo" size={18} />
              {t('manual.reverse')}
            </Button>
          ) : null}
        </>
      }
    >
      {entry.reversedBy ? (
        <Banner tone="warn" icon="undo">
          {t('manual.reversedBy', {
            d: formatDay(entry.reversedBy.at),
            who: reversal?.enteredByEmail ?? '—',
            r: entry.reversedBy.reason,
          })}
        </Banner>
      ) : null}
      <KeyValues>
        <KeyValue label={t('manual.shop')}>
          {entry.shopName} ·{' '}
          <Link
            to="/shops/$id"
            params={{ id: entry.tenantId }}
            className="font-normal text-primary underline"
          >
            {entry.shopSlug}.lytro.app
          </Link>
        </KeyValue>
        {entry.planName && entry.kind !== PlanPaymentKind.TopUp ? (
          <KeyValue label={t('manual.plan')}>{entry.planName}</KeyValue>
        ) : null}
        <KeyValue label={bank ? t('manual.reference') : t('manual.trx')} mono>
          {entry.transactionId ?? '—'}
        </KeyValue>
        <KeyValue label={bank ? t('manual.bank') : t('manual.wallet')} mono>
          {paidTo(entry)}
        </KeyValue>
        {bank ? null : (
          <KeyValue label={t('manual.senderShort')} mono>
            {entry.senderNumber ?? '—'}
          </KeyValue>
        )}
        <KeyValue label={t('manual.paidAt')}>
          {entry.paidAt ? formatSessionTime(entry.paidAt) : '—'}
        </KeyValue>
        <KeyValue label={t('manual.by')}>{entry.enteredByEmail ?? '—'}</KeyValue>
        <KeyValue label={t('common.reason')}>{entry.reason}</KeyValue>
      </KeyValues>
      <h3 className="text-[14px] font-semibold">{t('manual.evidence')}</h3>
      <Evidence entry={entry} onShot={onShot} />
    </Panel>
  );
}

function Evidence({ entry, onShot }: { entry: ManualEntry; onShot: () => void }) {
  const { t } = useTranslation();
  if (entry.evidenceId) {
    if (shotGone(entry)) {
      return (
        <Banner tone="info" icon="info">
          {t('manual.gone')}
        </Banner>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" tone="outline" small fit className={SMALL_BUTTON} onClick={onShot}>
          <ConsoleIcon name="image" size={18} />
          {t('manual.openShot')}
        </Button>
        <span className={NOTE}>{t('manual.linkNote')}</span>
      </div>
    );
  }
  if (entry.evidenceLine) {
    return (
      <div className="rounded-lg border border-line bg-neutral-50 px-3 py-2.5 font-mono text-[12px] break-words text-neutral-700">
        {entry.evidenceLine}
      </div>
    );
  }
  return null;
}

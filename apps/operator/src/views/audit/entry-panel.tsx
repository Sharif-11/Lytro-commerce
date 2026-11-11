import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { Panel } from '@/components/ui/panel';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { formatSessionTime } from '@/lib/session-time';
import type { AuditEntry } from '@/types/records';
import { actionWords, keyWords, summaryEntries, valueWords, whoWords } from './summary';

/**
 * §10f: one entry, as the server recorded it: its shop and target, its result, and every part of its summary named. Two
 * buttons narrow the log to this person's entries or this shop's. Read only.
 */
export function AuditEntryPanel({
  entry,
  onClose,
  onOnlyPerson,
  onOnlyShop,
}: {
  entry: AuditEntry | null;
  onClose: () => void;
  onOnlyPerson: (actorId: string) => void;
  onOnlyShop: (tenantId: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Panel
      open={entry !== null}
      title={entry ? actionWords(entry.action, t) : ''}
      sub={entry ? `${formatSessionTime(entry.createdAt)} · ${whoWords(entry, t)}` : undefined}
      onClose={onClose}
    >
      {entry ? (
        <>
          <KeyValues>
            <KeyValue label={t('audit.shop')}>
              {entry.shop ? (
                <>
                  {entry.shop.name} ·{' '}
                  <Link
                    to="/shops/$id"
                    params={{ id: entry.shop.id }}
                    className="text-primary-text underline"
                  >
                    {entry.shop.slug}.lytro.app
                  </Link>
                </>
              ) : (
                '—'
              )}
            </KeyValue>
            <KeyValue label={t('audit.target')} mono>
              {[entry.targetType, entry.targetId].filter(Boolean).join(' · ') || '—'}
            </KeyValue>
            <KeyValue label={t('audit.result')}>
              {entry.result === 'success' ? (
                <StatusChip tone="ok">{t('audit.done')}</StatusChip>
              ) : (
                <StatusChip tone="bad">{t('audit.failed')}</StatusChip>
              )}
            </KeyValue>
          </KeyValues>
          <h3 className="text-[14px] font-semibold">{t('audit.recorded')}</h3>
          <KeyValues>
            {summaryEntries(entry).map(([key, value]) => (
              <KeyValue key={key} label={keyWords(key, t)}>
                {valueWords(key, value, t)}
              </KeyValue>
            ))}
          </KeyValues>
          <div className="flex flex-wrap gap-2">
            {entry.actorId ? (
              <Button
                type="button"
                tone="outline"
                small
                fit
                className={SMALL_BUTTON}
                onClick={() => {
                  if (entry.actorId) onOnlyPerson(entry.actorId);
                }}
              >
                {t('audit.onlyPerson')}
              </Button>
            ) : null}
            {entry.shop ? (
              <Button
                type="button"
                tone="outline"
                small
                fit
                className={SMALL_BUTTON}
                onClick={() => {
                  if (entry.shop) onOnlyShop(entry.shop.id);
                }}
              >
                {t('audit.onlyShop')}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </Panel>
  );
}

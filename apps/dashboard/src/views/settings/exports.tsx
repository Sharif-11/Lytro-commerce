import { useTranslation } from 'react-i18next';
import { exportDownloadUrl, useExports, useRequestExport } from '@/api/exports';
import { Icon, type IconName } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { rowClass, RowList } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { formatClock, formatDayMonthYear } from '@/lib/dates';
import { fileSize } from '@/lib/limits';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { DataExport } from '@/types/data-export';

// Each state's tile: ready to download, failed, or being made.
const TILES: Record<DataExport['status'], { icon: IconName; tone: string }> = {
  ready: { icon: 'download', tone: 'bg-success-soft text-success' },
  failed: { icon: 'alert', tone: 'bg-danger-soft text-danger' },
  pending: { icon: 'clock', tone: 'bg-neutral-100 text-fg-muted' },
};

/**
 * Data export (LIF-16, the prototype's `exports`): the owner asks for an export of invoices, activity, products and
 * stock, made in a few minutes; each request with its state -- being made, ready to download for 24 hours, or failed
 * with a way to ask again. The owner's alone, as the page says.
 */
export function ExportsView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { viewer } = useShell();
  const exports = useExports({ enabled: viewer.isOwner });
  const request = useRequestExport();
  const ask = (): void => {
    request.mutate();
  };
  return (
    <ShellPage
      actions={
        viewer.isOwner ? (
          <Button size="sm" busy={request.isPending} onClick={ask}>
            <Icon name="download" />
            {t('exRequest')}
          </Button>
        ) : undefined
      }
    >
      <p className="text-[14px] text-fg-muted">{t('exLead')}</p>
      {exports.isError || request.isError ? (
        <Banner tone="bad">{errorText(exports.error ?? request.error)}</Banner>
      ) : null}
      {exports.data ? (
        <Card flush>
          {exports.data.length === 0 ? (
            <EmptyState icon="download">{t('exEmpty')}</EmptyState>
          ) : (
            <RowList>
              {exports.data.map((each) => (
                <div key={each.id} className={rowClass}>
                  <span
                    className={`flex size-10 flex-none items-center justify-center rounded-[8px] ${TILES[each.status].tone}`}
                  >
                    <Icon name={TILES[each.status].icon} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="num overflow-hidden text-[15px] font-medium text-ellipsis whitespace-nowrap">
                      {formatDayMonthYear(each.requestedAt)} · {formatClock(each.requestedAt)}
                    </span>
                    <span className="overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
                      {[
                        t('exKind'),
                        each.status === 'ready' && each.fileSizeBytes !== null
                          ? fileSize(each.fileSizeBytes)
                          : null,
                        each.status === 'ready' ? t('exLasts') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {each.status === 'ready' ? (
                    <a href={exportDownloadUrl(each.id)} className={buttonClass('primary', 'xs')}>
                      {t('exReady')}
                    </a>
                  ) : each.status === 'failed' ? (
                    <Button tone="outline" size="xs" busy={request.isPending} onClick={ask}>
                      {t('exFailed')}
                    </Button>
                  ) : (
                    <StatusTag tone="neutral">{t('exPending')}</StatusTag>
                  )}
                </div>
              ))}
            </RowList>
          )}
        </Card>
      ) : null}
      <p className="text-[14px] text-fg-muted">{t('exOwnerOnly')}</p>
    </ShellPage>
  );
}

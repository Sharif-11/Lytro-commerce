import { useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { PaymentPageReportStatus } from '@lytronix/validators';
import { useDismissReport, usePageReports } from '@/api/page-reports';
import { ActionPanel } from '@/components/ui/action-panel';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { LoadFailed } from '@/components/ui/load-failed';
import { Panel } from '@/components/ui/panel';
import { CELL_NOTE, QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { useAgo } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import type { PaymentPageReport } from '@/types/operator';
import { SuspendPagePanel } from '@/views/shop/suspend-page-panel';

type Step = 'facts' | 'suspend' | 'dismiss';

const STATUS_TONES: Record<PaymentPageReportStatus, ChipTone> = {
  [PaymentPageReportStatus.Open]: 'warn',
  [PaymentPageReportStatus.Actioned]: 'bad',
  [PaymentPageReportStatus.Dismissed]: 'mute',
};

const OPEN_PAGE_ICON = <ConsoleIcon name="arrow" size={18} />;
const PAGE_LINK =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap';

function DismissPanel({
  report,
  onClose,
  onCancel,
}: {
  report: PaymentPageReport;
  onClose: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const dismiss = useDismissReport();
  return (
    <ActionPanel
      title={t('reports.dismissTitle')}
      sub={`${report.shop.name} · ${t(`reportReasons.${report.reason}`)}`}
      onClose={onClose}
      onCancel={onCancel}
      actionLabel={t('reports.dismiss')}
      pending={dismiss.isPending}
      error={dismiss.isError ? errorMessage(dismiss.error, t) : null}
      onSubmit={() => {
        dismiss.mutate(report.id, {
          onSuccess: () => {
            toast(t('reports.dismissed'));
            onClose();
          },
        });
      }}
    >
      <Consequence>{t('reports.dismissConsequence')}</Consequence>
    </ActionPanel>
  );
}

function ReportFacts({
  report,
  onClose,
  onStep,
}: {
  report: PaymentPageReport;
  onClose: () => void;
  onStep: (step: Step) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  const stillOpen = report.status === PaymentPageReportStatus.Open;
  return (
    <Panel
      open
      title={t(`reportReasons.${report.reason}`)}
      sub={report.shop.name}
      onClose={onClose}
      footerInRow
      footer={
        stillOpen ? (
          <>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className="flex-1 sm:flex-none"
              onClick={() => {
                onStep('dismiss');
              }}
            >
              {t('reports.dismiss')}
            </Button>
            {report.shop.paymentPageSuspended ? null : (
              <Button
                type="button"
                small
                fit
                className="flex-1 sm:flex-none"
                onClick={() => {
                  onStep('suspend');
                }}
              >
                {t('reports.suspend')}
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <KeyValues>
        <KeyValue label={t('reports.shop')}>
          {report.shop.name} ·{' '}
          <Link
            to="/shops/$id"
            params={{ id: report.shop.id }}
            className="font-normal text-primary underline"
          >
            {report.shop.slug}.lytro.app
          </Link>
        </KeyValue>
        <KeyValue label={t('reports.note')}>{report.note ?? t('reports.noNote')}</KeyValue>
        <KeyValue label={t('reports.sent')}>
          {formatSessionTime(report.createdAt)} · {ago(report.createdAt)}
        </KeyValue>
        <KeyValue label={t('reports.from')} mono>
          {report.ip ?? '—'}
        </KeyValue>
        {report.handledAt ? (
          <KeyValue label={t('reports.handled')}>{formatSessionTime(report.handledAt)}</KeyValue>
        ) : null}
      </KeyValues>
      {/* The page is the shopper's: it opens apart, with nothing of this console. */}
      <a
        href={report.paymentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${PAGE_LINK} min-h-10 border border-line-strong bg-surface px-3.5 text-[14px]`}
      >
        {OPEN_PAGE_ICON}
        {t('reports.openPage')}
      </a>
    </Panel>
  );
}

/** ADM-12, TVR-02 (OPERATOR-CONSOLE-DESIGN §4a): what shoppers reported, and what was done about it. Each step is audited. */
export function PageReports(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ago = useAgo();
  const { view } = useSearch({ from: '/_console/page-reports' });
  const handled = view === 'handled';
  const open = usePageReports(PaymentPageReportStatus.Open);
  const dismissed = usePageReports(PaymentPageReportStatus.Dismissed);
  const actioned = usePageReports(PaymentPageReportStatus.Actioned);
  const [panel, setPanel] = useState<{ report: PaymentPageReport; step: Step } | null>(null);

  const reading = handled ? dismissed.isPending || actioned.isPending : open.isPending;
  const failed = handled ? dismissed.isError || actioned.isError : open.isError;
  const rows = handled
    ? [...(dismissed.data?.reports ?? []), ...(actioned.data?.reports ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : (open.data?.reports ?? []);

  function show(next: 'open' | 'handled'): void {
    void navigate({ to: '/page-reports', search: next === 'handled' ? { view: next } : {} });
  }

  function retry(): void {
    void open.refetch();
    void dismissed.refetch();
    void actioned.refetch();
  }

  function close(): void {
    setPanel(null);
  }

  const columns: Column<PaymentPageReport>[] = [
    {
      key: 'shop',
      label: t('reports.shop'),
      width: 'minmax(170px,1.2fr)',
      main: true,
      cell: (report) => (
        <>
          <button
            type="button"
            className="text-left"
            onClick={(event) => {
              event.stopPropagation();
              setPanel({ report, step: 'facts' });
            }}
          >
            {report.shop.name}
          </button>
          <div className={CELL_NOTE}>{report.shop.slug}.lytro.app</div>
        </>
      ),
    },
    {
      key: 'reason',
      label: t('reports.reason'),
      width: 'minmax(200px,1.6fr)',
      cell: (report) => (
        <>
          <div>{t(`reportReasons.${report.reason}`)}</div>
          {report.note ? <div className={CELL_NOTE}>{report.note}</div> : null}
        </>
      ),
    },
    {
      key: 'age',
      label: t('reports.reported'),
      width: '90px',
      cell: (report) => <span className="tabular-nums">{ago(report.createdAt)}</span>,
    },
    {
      key: 'state',
      label: t('reports.status'),
      width: '110px',
      cell: (report) => (
        <StatusChip tone={STATUS_TONES[report.status]}>
          {t(`reportStatuses.${report.status}`)}
        </StatusChip>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: handled ? '130px' : '280px',
      actions: true,
      cell: (report) => (
        <>
          <a
            href={report.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.stopPropagation();
            }}
            className={`${PAGE_LINK} min-h-8 px-2.5 text-[13px] ${
              handled
                ? 'border border-line-strong bg-surface'
                : 'bg-primary text-on-primary hover:bg-primary-hover'
            }`}
          >
            {t('reports.openPage')}
          </a>
          {handled ? null : report.shop.paymentPageSuspended ? (
            <StatusChip tone="bad" plain>
              {t('reports.pageOff')}
            </StatusChip>
          ) : (
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={SMALL_BUTTON}
              onClick={(event) => {
                event.stopPropagation();
                setPanel({ report, step: 'suspend' });
              }}
            >
              {t('reports.suspend')}
            </Button>
          )}
          {handled ? null : (
            <Button
              type="button"
              tone="ghost"
              small
              fit
              className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
              onClick={(event) => {
                event.stopPropagation();
                setPanel({ report, step: 'dismiss' });
              }}
            >
              {t('reports.dismiss')}
            </Button>
          )}
        </>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle title={t('nav.pageReports')} lead={t('reports.lead')} />
      {failed ? (
        <LoadFailed onRetry={retry} />
      ) : (
        <>
          <Chips>
            <Chip
              on={!handled}
              count={open.data?.reports.length ?? 0}
              onClick={() => {
                show('open');
              }}
            >
              {t('reportStatuses.open')}
            </Chip>
            <Chip
              on={handled}
              count={dismissed.data?.reports.length ?? 0}
              onClick={() => {
                show('handled');
              }}
            >
              {t('reportStatuses.dismissed')}
            </Chip>
            <Chip
              on={handled}
              count={actioned.data?.reports.length ?? 0}
              onClick={() => {
                show('handled');
              }}
            >
              {t('reportStatuses.actioned')}
            </Chip>
          </Chips>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(report) => report.id}
            loading={reading}
            onOpen={(report) => {
              setPanel({ report, step: 'facts' });
            }}
            empty={
              <EmptyBox icon="flag" title={t('reports.empty')} hint={t('reports.emptyHint')} />
            }
          />
        </>
      )}
      {panel?.step === 'facts' ? (
        <ReportFacts
          report={panel.report}
          onClose={close}
          onStep={(step) => {
            setPanel({ report: panel.report, step });
          }}
        />
      ) : null}
      {panel?.step === 'suspend' ? (
        <SuspendPagePanel
          shop={panel.report.shop}
          onClose={close}
          onCancel={() => {
            setPanel({ report: panel.report, step: 'facts' });
          }}
        />
      ) : null}
      {panel?.step === 'dismiss' ? (
        <DismissPanel
          report={panel.report}
          onClose={close}
          onCancel={() => {
            setPanel({ report: panel.report, step: 'facts' });
          }}
        />
      ) : null}
    </ConsolePage>
  );
}

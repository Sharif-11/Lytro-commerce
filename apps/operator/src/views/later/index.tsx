import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/components/ui/banner';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard, ConsolePage, PageTitle, SoonTag } from '@/components/ui/console-page';

/** A dashed table of shapes: what the page will list. */
function SketchTable({ rows, columns }: { rows: number; columns: string[] }): React.JSX.Element {
  const template = { '--cols': columns.join(' ') } as React.CSSProperties;
  return (
    <section
      className="overflow-hidden rounded-card border border-dashed border-line"
      style={template}
    >
      <div className="hidden items-center gap-3 border-b border-line bg-neutral-50 px-4 py-2.5 sm:grid sm:grid-cols-[var(--cols)]">
        {columns.map((column, index) => (
          <span key={`${column}-${String(index)}`} className="skel w-3/5" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="min-h-[52px] border-t border-line first:border-t-0" />
      ))}
    </section>
  );
}

/** The filters the page will have, greyed; the first is on where the page opens on one. */
function SketchChips({ labels, firstOn = false }: { labels: string[]; firstOn?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0">
      {labels.map((label, index) => (
        <span
          key={label}
          className={`inline-flex h-[34px] flex-none items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap ${
            firstOn && index === 0
              ? 'border-ink bg-ink text-white'
              : 'border-line bg-surface text-neutral-700'
          }`}
        >
          {t(`later.drawn.${label}`)}
        </span>
      ))}
    </div>
  );
}

function ReportsSketch(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['shops', 'paying', 'revenue', 'topUps'].map((key) => (
          <div
            key={key}
            className="flex min-w-0 flex-col gap-1 rounded-card border border-dashed border-line bg-surface px-4 py-3.5"
          >
            <span className="text-[13px] font-medium text-fg-muted">{t(`later.drawn.${key}`)}</span>
            <span className="flex h-[26px] items-center">
              <span className="skel h-6! w-[60px]" />
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-[220px] items-center justify-center gap-1 rounded-card border border-dashed border-line text-fg-muted">
        <ConsoleIcon name="chart" />
        {t('later.drawn.revenueChart')}
      </div>
      <SketchTable rows={5} columns={['1.5fr', '1fr', '1fr', '1fr']} />
    </>
  );
}

function NoticesSketch(): React.JSX.Element {
  const { t } = useTranslation();
  const button =
    'inline-flex h-10 items-center gap-2 rounded-control px-3.5 text-[14px] font-semibold opacity-45';
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${button} bg-primary text-on-primary`}>
          <ConsoleIcon name="plus" size={18} />
          {t('later.drawn.newNotice')}
        </span>
        <span className={`${button} border border-line-strong bg-surface`}>
          {t('later.drawn.templates')}
        </span>
      </div>
      <SketchTable rows={5} columns={['2fr', '120px', '120px', '140px', '100px']} />
    </>
  );
}

function ManualSketch(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <ConsoleCard className="border-dashed bg-transparent">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {['shop', 'kind', 'amount', 'wallet', 'trxId', 'sender', 'paidAt', 'evidence'].map(
          (key) => (
            <div key={key} className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-neutral-700">
                {t(`later.drawn.${key}`)}
              </span>
              <div className="h-11 rounded-control border border-dashed border-line-strong" />
            </div>
          ),
        )}
      </div>
    </ConsoleCard>
  );
}

export type LaterKey = 'reports' | 'audit' | 'inbox' | 'notices' | 'verification' | 'manual';

const LATER: Record<LaterKey, { requirement: string; drawing: ReactNode }> = {
  reports: { requirement: 'ADM-09', drawing: <ReportsSketch /> },
  audit: {
    requirement: 'ADM-08',
    drawing: (
      <>
        <SketchChips labels={['shop', 'actor', 'action', 'date']} />
        <SketchTable rows={8} columns={['140px', '1fr', '1.4fr', '2fr', '120px']} />
      </>
    ),
  },
  inbox: {
    requirement: 'SUP-04, SUP-05',
    drawing: (
      <>
        <SketchChips labels={['open', 'overdue', 'waiting', 'closed']} firstOn />
        <SketchTable rows={6} columns={['1.6fr', '1fr', '100px', '100px']} />
      </>
    ),
  },
  notices: { requirement: 'NTC-01 to NTC-20', drawing: <NoticesSketch /> },
  verification: {
    requirement: 'KYC-07, KYC-09',
    drawing: (
      <>
        <SketchChips labels={['pendingReview', 'verified', 'rejected']} firstOn />
        <SketchTable rows={5} columns={['1.6fr', '140px', '140px', '120px']} />
      </>
    ),
  },
  manual: { requirement: 'ADM-14 to ADM-17', drawing: <ManualSketch /> },
};

/** Later work drawn as what it will be, labelled with its requirement (rule 8), never as a working screen. */
export function LaterPage({ page }: { page: LaterKey }): React.JSX.Element {
  const { t } = useTranslation();
  const { requirement, drawing } = LATER[page];
  return (
    <ConsolePage>
      <PageTitle title={t(`nav.${page}`)} lead={t(`later.leads.${page}`)} tag={<SoonTag />} />
      <Banner tone="info" icon="info">
        <b className="font-semibold">{t('later.title')}</b> · {requirement}
        <div>{t('later.body')}</div>
      </Banner>
      {drawing}
    </ConsolePage>
  );
}

/** A destination the server already serves, whose screen comes with a later part of the rebuild. */
export function HoldingPage({ titleKey }: { titleKey: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <ConsolePage>
      <PageTitle title={t(titleKey)} />
      <Banner tone="info" icon="info">
        <b className="font-semibold">{t('later.title')}</b>
        <div>{t('later.holding')}</div>
      </Banner>
    </ConsolePage>
  );
}

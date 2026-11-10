import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { ConsumerMetric, SalesBucket } from '@lytronix/validators';
import { reportCsv, type ReportKind } from '@/api/reports';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { NOTE } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import { saveFile } from '@/lib/save-file';
import { Filters, Pick, PickInput, PickSelect } from '@/views/records/parts';
import { ConsumersReportView } from './consumers';
import { PRESETS, presetPeriod, presetSplit, type Period, type Preset } from './period';
import { RevenueReportView } from './revenue';
import { ShopsReportView } from './shops-report';

export interface ReportsSearch {
  view?: 'shops' | 'consumers';
  preset?: Preset;
  from?: string;
  to?: string;
  split?: SalesBucket;
  metric?: ConsumerMetric;
}

const SPLITS: readonly SalesBucket[] = [
  SalesBucket.Week,
  SalesBucket.Month,
  SalesBucket.Quarter,
  SalesBucket.Year,
];
// The select's value back to its split.
const SPLIT_OF = new Map<string, SalesBucket>(SPLITS.map((each) => [each, each]));
const METRICS: readonly ConsumerMetric[] = [
  ConsumerMetric.Storage,
  ConsumerMetric.Bandwidth,
  ConsumerMetric.Sms,
];
const TABS: readonly { kind: ReportKind; view: ReportsSearch['view'] }[] = [
  { kind: 'revenue', view: undefined },
  { kind: 'shops', view: 'shops' },
  { kind: 'consumers', view: 'consumers' },
];

/**
 * OPERATOR-CONSOLE-DESIGN §10e, ADM-09, D8-40 to D8-46 (Slice 8.4's routes): what Lytro earned, how shops come and go, and
 * who uses most, for a period the operator picks. Each opens on this month, split by week, and Export saves the open
 * tab's CSV for the period shown.
 */
export function Reports(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: '/reports' });
  const search = useSearch({ from: '/_console/reports' });
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const kind: ReportKind = search.view ?? 'revenue';
  const preset: Preset | null = search.from || search.to ? null : (search.preset ?? 'thisMonth');
  const base = presetPeriod(search.preset ?? 'thisMonth');
  const period: Period = {
    dateFrom: search.from ?? base.dateFrom,
    dateTo: search.to ?? base.dateTo,
  };
  const split = search.split ?? presetSplit(search.preset ?? 'thisMonth');
  const metric = search.metric ?? ConsumerMetric.Storage;

  function go(next: Partial<ReportsSearch>): void {
    void navigate({ search: (previous) => ({ ...previous, ...next }) });
  }

  async function exportCsv(): Promise<void> {
    setExporting(true);
    try {
      const { name, file } = await reportCsv(kind, period, kind === 'consumers' ? metric : split);
      saveFile(name, file);
    } catch (error) {
      toast(errorMessage(error, t));
    } finally {
      setExporting(false);
    }
  }

  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.reports')}
        lead={t('records.lead')}
        actions={
          <Button
            type="button"
            tone="outline"
            small
            fit
            loading={exporting}
            className="flex-[1_1_auto] sm:flex-none"
            onClick={() => {
              void exportCsv();
            }}
          >
            <ConsoleIcon name="down" />
            {t('records.export')}
          </Button>
        }
      />
      <Chips>
        {TABS.map((tab) => (
          <Chip
            key={tab.kind}
            on={tab.kind === kind}
            onClick={() => {
              go({ view: tab.view });
            }}
          >
            {t(`records.tabs.${tab.kind}`)}
          </Chip>
        ))}
      </Chips>
      {kind === 'consumers' ? (
        <>
          <div className={NOTE}>{t('records.consumersLead')}</div>
          <Chips>
            {METRICS.map((each) => (
              <Chip
                key={each}
                on={each === metric}
                onClick={() => {
                  go({ metric: each });
                }}
              >
                {t(`records.metrics.${each}`)}
              </Chip>
            ))}
          </Chips>
        </>
      ) : null}
      <Chips>
        {PRESETS.map((each) => (
          <Chip
            key={each}
            on={each === preset}
            onClick={() => {
              go({ preset: each, from: undefined, to: undefined, split: undefined });
            }}
          >
            {t(`records.presets.${each}`)}
          </Chip>
        ))}
      </Chips>
      <Filters>
        <Pick label={t('records.from')}>
          <PickInput
            type="date"
            value={period.dateFrom}
            max={period.dateTo}
            onChange={(event) => {
              if (event.target.value) go({ from: event.target.value, to: period.dateTo });
            }}
          />
        </Pick>
        <Pick label={t('records.to')}>
          <PickInput
            type="date"
            value={period.dateTo}
            min={period.dateFrom}
            onChange={(event) => {
              if (event.target.value) go({ from: period.dateFrom, to: event.target.value });
            }}
          />
        </Pick>
        {kind === 'consumers' ? null : (
          <Pick label={t('records.split')} wide>
            <PickSelect
              value={split}
              onChange={(event) => {
                const next = SPLIT_OF.get(event.target.value);
                if (next) go({ split: next });
              }}
            >
              {SPLITS.map((each) => (
                <option key={each} value={each}>
                  {t(`records.splits.${each}`)}
                </option>
              ))}
            </PickSelect>
          </Pick>
        )}
      </Filters>
      {kind === 'revenue' ? <RevenueReportView period={period} split={split} /> : null}
      {kind === 'shops' ? <ShopsReportView period={period} split={split} /> : null}
      {kind === 'consumers' ? <ConsumersReportView period={period} metric={metric} /> : null}
    </ConsolePage>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import { CourierAreaMatch, CourierAreaState } from '@lytronix/validators';
import { useCourierAreas, useLocations, useRefreshAreas } from '@/api/couriers';
import { Banner } from '@/components/ui/banner';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { Pager } from '@/components/ui/pager';
import { CELL_NOTE, NOTE, QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { formatDay } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import type { CourierArea, CourierAreaCounts } from '@/types/couriers';
import { ConfirmAreasPanel, PlacePanel } from './area-panels';
import { CouriersHead } from './couriers-head';
import { placeName, thanaIndex } from './places';

const SEARCH_DEBOUNCE_MS = 300;

/** The chips, in the sketch's order; null is All. Suggested opens, since it's the operator's work. */
const FILTERS: { state: CourierAreaState | null; word: string; count: keyof CourierAreaCounts }[] =
  [
    { state: null, word: 'courierAreas.all', count: 'all' },
    { state: CourierAreaState.Suggested, word: 'courierAreas.suggested', count: 'suggested' },
    { state: CourierAreaState.Unassigned, word: 'courierAreas.unassigned', count: 'unassigned' },
    { state: CourierAreaState.Assigned, word: 'courierAreas.assigned', count: 'assigned' },
    { state: CourierAreaState.Retired, word: 'courierAreas.retired', count: 'retired' },
  ];

const MATCH_TONES: Record<CourierAreaMatch, ChipTone> = {
  [CourierAreaMatch.OwnName]: 'ok',
  [CourierAreaMatch.Operator]: 'info',
  [CourierAreaMatch.Suggested]: 'warn',
  [CourierAreaMatch.None]: 'mute',
};

const MATCH_WORDS: Record<CourierAreaMatch, string> = {
  [CourierAreaMatch.OwnName]: 'courierAreas.own_name',
  [CourierAreaMatch.Operator]: 'courierAreas.operator',
  [CourierAreaMatch.Suggested]: 'courierAreas.matchSuggested',
  [CourierAreaMatch.None]: 'courierAreas.none',
};

type Open = { step: 'place'; area: CourierArea } | { step: 'confirm' } | null;

/**
 * OPERATOR-CONSOLE-DESIGN §10b, CUS-10 (Slice 6.4's read): RedX needs one of its own areas on every booking. An area counts in a
 * thana once it's named after it or the operator places it; suggestions wait for the operator, many confirmed at once.
 */
export function RedxAreas(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [state, setState] = useState<CourierAreaState | null>(CourierAreaState.Suggested);
  const [zillaId, setZillaId] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Open>(null);
  const areas = useCourierAreas({ state, zillaId, q, page });
  const locations = useLocations();
  const refresh = useRefreshAreas();
  const zillas = useMemo(() => locations.data ?? [], [locations.data]);
  const places = useMemo(() => thanaIndex(zillas), [zillas]);
  const data = areas.data;
  const pick = state === CourierAreaState.Suggested;
  const rows = data?.areas ?? [];
  const chosen = rows.filter((area) => picked.has(area.id));

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQ(typed.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
    };
  }, [typed]);

  function narrow(next: () => void): void {
    next();
    setPage(1);
    setPicked(new Set());
  }

  function districtOf(area: CourierArea): string {
    const zilla = zillas.find((each) => each.id === area.zillaId);
    return zilla ? placeName(zilla, i18n.language) : area.districtName;
  }

  function thanaName(id: number): string {
    const place = places.get(id);
    return place ? placeName(place.thana, i18n.language) : String(id);
  }

  const columns: Column<CourierArea>[] = [
    ...(pick
      ? [
          {
            key: 'pick',
            label: '',
            width: '36px',
            cell: (area: CourierArea) => (
              <input
                type="checkbox"
                aria-label={area.name}
                checked={picked.has(area.id)}
                onChange={(event) => {
                  const next = new Set(picked);
                  if (event.target.checked) next.add(area.id);
                  else next.delete(area.id);
                  setPicked(next);
                }}
                className="size-5 rounded accent-primary"
              />
            ),
          },
        ]
      : []),
    {
      key: 'area',
      label: t('courierAreas.cArea'),
      width: 'minmax(200px,1.6fr)',
      main: true,
      cell: (area) => (
        <>
          <div>
            {area.name} <span className={`mono ${CELL_NOTE}`}>{area.areaCode}</span>
          </div>
          {area.retiredAt ? (
            <div className="text-[13px] font-normal whitespace-normal text-fg-muted">
              {t('courierAreas.retiredOn', { d: formatDay(area.retiredAt) })}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'district',
      label: t('courierAreas.cDistrict'),
      width: '110px',
      cell: districtOf,
    },
    {
      key: 'post',
      label: t('courierAreas.cPost'),
      width: '90px',
      cell: (area) =>
        area.postCode ? (
          <span className="tabular-nums">{area.postCode}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      key: 'thana',
      label: t('courierAreas.cThana'),
      width: 'minmax(130px,1fr)',
      cell: (area) =>
        area.thanaId !== null ? (
          thanaName(area.thanaId)
        ) : area.suggestedThanaId !== null ? (
          <span className="text-warning">
            {t('courierAreas.suggestedThana', { th: thanaName(area.suggestedThanaId) })}
          </span>
        ) : (
          <span className="text-fg-muted">{t('courierAreas.noThana')}</span>
        ),
    },
    {
      key: 'match',
      label: t('courierAreas.cMatch'),
      width: '130px',
      cell: (area) => (
        <StatusChip tone={MATCH_TONES[area.match]} plain>
          {t(MATCH_WORDS[area.match])}
        </StatusChip>
      ),
    },
    {
      key: 'acts',
      label: '',
      width: '100px',
      actions: true,
      cell: (area) =>
        area.retiredAt ? null : (
          <Button
            type="button"
            tone="outline"
            small
            fit
            className={SMALL_BUTTON}
            onClick={() => {
              setOpen({ step: 'place', area });
            }}
          >
            {area.thanaId !== null ? t('courierAreas.change') : t('courierAreas.place')}
          </Button>
        ),
    },
  ];

  const noToken = data !== undefined && !data.tokenSet;
  const empty =
    noToken || data?.counts.all === 0 ? (
      <EmptyBox
        icon="pin"
        title={t('courierAreas.empty')}
        hint={noToken ? t('courierAreas.emptyHint') : t('courierAreas.emptyRefreshHint')}
      />
    ) : (
      <EmptyBox
        icon="pin"
        title={t('courierAreas.noneHere')}
        hint={t('courierAreas.noneHereHint')}
      />
    );

  return (
    <ConsolePage>
      <CouriersHead active="areas" />
      <div className="text-[14px] text-fg-muted">{t('courierAreas.lead')}</div>
      {noToken ? (
        <Banner tone="warn" icon="warn">
          <Trans i18nKey="courierAreas.noToken" components={{ mono: <span className="mono" /> }} />
        </Banner>
      ) : null}
      <div className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 text-[13px] text-fg-muted">
          {data?.lastReadAt
            ? t('courierAreas.read', {
                n: data.counts.all.toLocaleString('en-US'),
                d: formatSessionTime(data.lastReadAt),
              })
            : null}
        </span>
        <Button
          type="button"
          tone="outline"
          small
          fit
          className={SMALL_BUTTON}
          disabled={noToken || data === undefined}
          loading={refresh.isPending}
          onClick={() => {
            refresh.mutate(undefined, {
              onSuccess: (answer) => {
                toast(
                  t('courierAreas.refreshed', {
                    l: answer.listed.toLocaleString('en-US'),
                    a: answer.added,
                    r: answer.renamed,
                    x: answer.retired,
                    b: answer.back,
                  }),
                );
              },
            });
          }}
        >
          <ConsoleIcon name="refresh" size={18} />
          {t('courierAreas.refresh')}
        </Button>
      </div>
      {refresh.isError ? <ErrorBanner message={errorMessage(refresh.error, t)} /> : null}
      {areas.isError ? (
        <LoadFailed
          onRetry={() => {
            void areas.refetch();
          }}
        />
      ) : (
        <>
          <Chips>
            {FILTERS.map((filter) => (
              <Chip
                key={filter.count}
                on={state === filter.state}
                count={data?.counts[filter.count] ?? 0}
                onClick={() => {
                  narrow(() => {
                    setState(filter.state);
                  });
                }}
              >
                {t(filter.word)}
              </Chip>
            ))}
          </Chips>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-11 min-w-0 flex-[1_1_220px] items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-fg-subtle focus-within:border-line-active focus-within:ring-2 focus-within:ring-field-ring">
              <ConsoleIcon name="search" />
              <input
                type="search"
                aria-label={t('courierAreas.search')}
                placeholder={t('courierAreas.search')}
                value={typed}
                onChange={(event) => {
                  setTyped(event.target.value);
                  setPage(1);
                  setPicked(new Set());
                }}
                className="min-w-0 flex-1 bg-transparent text-input text-ink outline-none placeholder:text-placeholder"
              />
            </div>
            <select
              aria-label={t('courierAreas.district')}
              value={zillaId ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                narrow(() => {
                  setZillaId(value === '' ? null : Number(value));
                });
              }}
              className="h-11 w-[240px] max-w-full flex-none rounded-control border border-line-strong bg-surface px-3 text-input text-ink focus:border-line-active focus:ring-2 focus:ring-field-ring focus:outline-none sm:text-[15px]"
            >
              <option value="">{t('courierAreas.allDistricts')}</option>
              {zillas.map((zilla) => (
                <option key={zilla.id} value={zilla.id}>
                  {placeName(zilla, i18n.language)}
                </option>
              ))}
            </select>
          </div>
          {pick && rows.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {t('courierAreas.selected', { n: chosen.length })}
                </span>
                <Button
                  type="button"
                  small
                  fit
                  className={SMALL_BUTTON}
                  disabled={chosen.length === 0}
                  onClick={() => {
                    setOpen({ step: 'confirm' });
                  }}
                >
                  {t('courierAreas.confirmN', { n: chosen.length })}
                </Button>
                <Button
                  type="button"
                  tone="ghost"
                  small
                  fit
                  className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
                  disabled={chosen.length === 0}
                  onClick={() => {
                    setPicked(new Set());
                  }}
                >
                  {t('courierAreas.clear')}
                </Button>
              </div>
              <div className={NOTE}>{t('courierAreas.check')}</div>
            </>
          ) : null}
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(area) => area.id}
            loading={areas.isPending}
            faded={(area) => area.retiredAt !== null}
            empty={empty}
          />
          <Pager page={page} pages={data?.pages ?? 1} onPage={setPage} />
        </>
      )}
      {open?.step === 'place' ? (
        <PlacePanel
          area={open.area}
          zillas={zillas}
          districtName={districtOf(open.area)}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.step === 'confirm' ? (
        <ConfirmAreasPanel
          areas={chosen}
          onClose={() => {
            setOpen(null);
          }}
          onDone={() => {
            setOpen(null);
            setPicked(new Set());
          }}
        />
      ) : null}
    </ConsolePage>
  );
}

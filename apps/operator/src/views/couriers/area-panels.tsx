import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import { useAssignArea, useConfirmAreas } from '@/api/couriers';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { Panel } from '@/components/ui/panel';
import { QUIET_BUTTON } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import type { CourierArea, LocationZilla } from '@/types/couriers';
import { placeName, thanaIndex } from './places';

/** How many thanas a search shows at once; a few letters narrow 500-odd to a handful. */
const THANAS_SHOWN = 40;

/**
 * CUS-10: an area placed in a thana, or moved, or taken off one. Staff booking an order in that thana then see it among the
 * thana's areas, and its district becomes the thana's. The search runs over every thana; empty, it shows the area's district.
 */
export function PlacePanel({
  area,
  zillas,
  districtName,
  onClose,
}: {
  area: CourierArea;
  zillas: LocationZilla[];
  /** The area's district as the table names it. */
  districtName: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const assign = useAssignArea();
  const places = useMemo(() => thanaIndex(zillas), [zillas]);
  const current = area.thanaId === null ? null : (places.get(area.thanaId) ?? null);
  const startAt = area.thanaId ?? area.suggestedThanaId;
  const [chosen, setChosen] = useState<number | null>(startAt);
  const [typed, setTyped] = useState('');
  const word = typed.trim().toLowerCase();
  const shown = useMemo(() => {
    const all = [...places.values()];
    const matching = word
      ? all.filter(
          ({ thana, zilla }) =>
            thana.nameEn.toLowerCase().includes(word) ||
            thana.nameBn.includes(word) ||
            zilla.nameEn.toLowerCase().includes(word) ||
            zilla.nameBn.includes(word),
        )
      : all.filter(
          ({ thana, zilla }) =>
            zilla.id === area.zillaId || thana.id === startAt || thana.id === area.thanaId,
        );
    return matching.slice(0, THANAS_SHOWN);
  }, [places, word, area.zillaId, area.thanaId, startAt]);
  const target = chosen === null ? null : (places.get(chosen) ?? null);
  const change = area.thanaId !== null;

  function save(thanaId: number | null): void {
    assign.mutate(
      { id: area.id, thanaId },
      {
        onSuccess: () => {
          toast(
            thanaId === null || !target
              ? t('courierAreas.takenOff', { a: area.name })
              : t('courierAreas.placed', {
                  a: area.name,
                  th: placeName(target.thana, i18n.language),
                }),
          );
          onClose();
        },
      },
    );
  }

  return (
    <Panel
      open
      title={t('courierAreas.placeTitle', { a: area.name })}
      sub={
        <>
          {area.areaCode} ·{' '}
          {current
            ? t('courierAreas.now', { th: placeName(current.thana, i18n.language) })
            : districtName}
        </>
      }
      onClose={onClose}
      dismissable={!assign.isPending}
      footerInRow
      footer={
        <>
          {change ? (
            <Button
              type="button"
              tone="ghost"
              small
              fit
              disabled={assign.isPending}
              className={`flex-1 sm:flex-none ${QUIET_BUTTON}`}
              onClick={() => {
                save(null);
              }}
            >
              {t('courierAreas.takeOff')}
            </Button>
          ) : (
            <Button
              type="button"
              tone="outline"
              small
              fit
              disabled={assign.isPending}
              className="flex-1 sm:flex-none"
              onClick={onClose}
            >
              {t('common.cancel')}
            </Button>
          )}
          <Button
            type="button"
            small
            fit
            loading={assign.isPending}
            disabled={chosen === null || chosen === area.thanaId}
            className="flex-1 sm:flex-none"
            onClick={() => {
              save(chosen);
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-label font-field-label text-field-label">
            {t('courierAreas.cThana')}
          </span>
          <div className="flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-fg-subtle focus-within:border-line-active focus-within:ring-2 focus-within:ring-field-ring">
            <ConsoleIcon name="search" />
            <input
              type="search"
              aria-label={t('courierAreas.findThana')}
              placeholder={t('courierAreas.findThana')}
              data-autofocus
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
              className="min-w-0 flex-1 bg-transparent text-input text-ink outline-none placeholder:text-placeholder"
            />
          </div>
        </div>
        <div
          role="listbox"
          aria-label={t('courierAreas.cThana')}
          className="-mx-4 flex flex-col sm:-mx-5"
        >
          {shown.map(({ thana, zilla }) => (
            <button
              key={thana.id}
              type="button"
              role="option"
              aria-selected={chosen === thana.id}
              onClick={() => {
                setChosen(thana.id);
              }}
              className="flex min-h-[60px] w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0 hover:bg-surface-hover sm:px-5"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-medium">
                  {placeName(thana, i18n.language)}
                </span>
                <span className="truncate text-[13px] text-fg-muted">
                  {placeName(zilla, i18n.language)}
                </span>
              </span>
              {chosen === thana.id ? <ConsoleIcon name="check" /> : null}
            </button>
          ))}
        </div>
        {target ? (
          <Consequence>
            {t('courierAreas.placeConsequence', {
              th: placeName(target.thana, i18n.language),
              z: placeName(target.zilla, i18n.language),
            })}
          </Consequence>
        ) : null}
        {assign.isError ? <ErrorBanner message={errorMessage(assign.error, t)} /> : null}
      </div>
    </Panel>
  );
}

/** Suggested areas confirmed many at a time: each then counts in the thana suggested for it, and can still move later. */
export function ConfirmAreasPanel({
  areas,
  onClose,
  onDone,
}: {
  areas: CourierArea[];
  onClose: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirmAreas();
  return (
    <ActionPanel
      title={t('courierAreas.confirmTitle', { count: areas.length })}
      sub={areas.map((area) => area.name).join(' · ')}
      onClose={onClose}
      actionLabel={t('courierAreas.confirmN', { n: areas.length })}
      pending={confirm.isPending}
      error={confirm.isError ? errorMessage(confirm.error, t) : null}
      onSubmit={() => {
        confirm.mutate(
          areas.map((area) => area.id),
          {
            onSuccess: (answer) => {
              toast(t('courierAreas.confirmed', { count: answer.confirmed }));
              onDone();
            },
          },
        );
      }}
    >
      <Consequence>{t('courierAreas.confirmConsequence')}</Consequence>
    </ActionPanel>
  );
}

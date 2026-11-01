import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { RowList } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import type { DeliverySettings, Locations } from '@/types/delivery';
import { areaKey, coverOf, holderOf, matches, type AreaRef } from './areas';
import { useDeliveryWords } from './delivery-words';

// A search lists at most this many thanas; typing more narrows them.
const THANAS_SHOWN = 30;

/**
 * What the picker picks: a zone's areas (cities, districts, thanas), the shop's own thanas, or one thana for Check an
 * address, which picks as it is tapped.
 */
export type PickMode = 'zone' | 'thanas' | 'thana';

/** A group of rows under its heading (the prototype's Part 22 picker). */
function Group({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-none flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-fg-muted">{title}</h3>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <RowList>{children}</RowList>
      </div>
    </div>
  );
}

/**
 * The area picker (Part 22's `sh-area-pick` and `sh-area-district`; agreed in the 11.11 read): searched in Bangla or
 * English, grouped Cities, Districts and Thanas (a thana with its district); a district opens its thanas; an area
 * another zone holds says which and is not picked; a thana another zone covers by its city or district says where it
 * is now, and moves if picked. Areas the owner has already are ticked and stay so here.
 */
export function AreaPickSheet({
  open,
  mode,
  title,
  settings,
  locations,
  zoneId,
  chosen,
  onAdd,
  onBack,
  onClose,
}: {
  open: boolean;
  mode: PickMode;
  title: string;
  /** The zones, to say which holds an area; one thana picked alone (New order's address) needs none. */
  settings?: DeliverySettings;
  locations: Locations;
  /** The zone the areas are for; another zone's areas are what is taken. Null for a new zone or Check an address. */
  zoneId: string | null;
  chosen: readonly AreaRef[];
  onAdd: (refs: AreaRef[]) => void;
  /** Back to the sheet the picker was opened from. */
  onBack?: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('shop');
  const words = useDeliveryWords();
  const bn = i18n.language === 'bn';
  const [typed, setTyped] = useState('');
  const [district, setDistrict] = useState<number | null>(null);
  const [ticked, setTicked] = useState<readonly AreaRef[]>([]);

  useEffect(() => {
    if (!open) return;
    setTyped('');
    setDistrict(null);
    setTicked([]);
  }, [open]);

  const single = mode === 'thana';
  const has = (list: readonly AreaRef[], ref: AreaRef) =>
    list.some((each) => areaKey(each) === areaKey(ref));
  const named = (each: { nameEn: string; nameBn: string }) => (bn ? each.nameBn : each.nameEn);

  const toggle = (ref: AreaRef) => {
    if (single) {
      onAdd([ref]);
      return;
    }
    setTicked((now) =>
      has(now, ref) ? now.filter((each) => areaKey(each) !== areaKey(ref)) : [...now, ref],
    );
  };

  /** One area's row: ticked, free, already the owner's, or another zone's and not to be picked. */
  const pickRow = (ref: AreaRef, label: string, extra?: ReactNode) => {
    const taken = single || !settings ? null : holderOf(settings, ref, zoneId);
    const cover =
      single || taken || !settings || ref.kind !== 'thana'
        ? null
        : coverOf(settings, locations, ref.id, zoneId);
    const sub = taken
      ? t('areaInZone', { zone: words.zone(taken) })
      : cover
        ? t('areaNowIn', {
            zone: words.zone(cover.zone),
            by: t(cover.by === 'city' ? 'byItsCity' : 'byItsDistrict'),
          })
        : undefined;
    if (single) {
      return (
        <button
          key={areaKey(ref)}
          type="button"
          onClick={() => {
            toggle(ref);
          }}
          className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left text-[15px] font-medium"
        >
          {label}
        </button>
      );
    }
    const owned = has(chosen, ref);
    return (
      <div key={areaKey(ref)} className="flex items-center gap-1 pr-2 pl-4">
        <div className="min-w-0 flex-1 py-1.5">
          <CheckRow
            checked={owned || has(ticked, ref)}
            disabled={owned || taken !== null}
            onChange={() => {
              toggle(ref);
            }}
            title={label}
            sub={sub}
          />
        </div>
        {extra}
      </div>
    );
  };

  /** A district's row: in a zone, picked whole and opened; elsewhere opened for its thanas. */
  const districtRow = (zilla: Locations['zillas'][number]) => {
    const openIt = (
      <button
        type="button"
        aria-label={t('areaThanasOf', { district: t('districtName', { name: named(zilla) }) })}
        onClick={() => {
          setDistrict(zilla.id);
        }}
        className="inline-flex size-9 flex-none items-center justify-center rounded-[8px] text-neutral-500"
      >
        <Icon name="right" />
      </button>
    );
    if (mode === 'zone') {
      return pickRow(
        { kind: 'zilla', id: zilla.id },
        t('districtName', { name: named(zilla) }),
        openIt,
      );
    }
    return (
      <button
        key={`z:${String(zilla.id)}`}
        type="button"
        onClick={() => {
          setDistrict(zilla.id);
        }}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span className="min-w-0 flex-1 text-[15px] font-medium">
          {t('districtName', { name: named(zilla) })}
        </span>
        <span className="text-neutral-500">
          <Icon name="right" />
        </span>
      </button>
    );
  };

  const opened = district === null ? null : locations.zillas.find((each) => each.id === district);
  const cities =
    mode === 'zone'
      ? locations.cities.filter((city) => matches(typed, city.nameEn, city.nameBn))
      : [];
  const zillas = locations.zillas.filter((zilla) => matches(typed, zilla.nameEn, zilla.nameBn));
  const thanas =
    typed.trim() === ''
      ? []
      : locations.zillas
          .flatMap((zilla) =>
            zilla.thanas
              .filter((thana) => matches(typed, thana.nameEn, thana.nameBn))
              .map((thana) => ({ thana, zilla })),
          )
          .slice(0, THANAS_SHOWN);
  const nothing = cities.length === 0 && zillas.length === 0 && thanas.length === 0;

  return (
    <Sheet
      open={open}
      title={opened ? t('districtName', { name: named(opened) }) : title}
      onBack={
        opened
          ? () => {
              setDistrict(null);
            }
          : onBack
      }
      onClose={onClose}
      footer={
        single ? undefined : (
          <Button
            wide
            disabled={ticked.length === 0}
            onClick={() => {
              onAdd([...ticked]);
            }}
          >
            {t('areaAddN', { count: ticked.length })}
          </Button>
        )
      }
    >
      {open ? (
        opened ? (
          <>
            {mode === 'zone' ? (
              <Group title={t('areaDistricts')}>
                {pickRow(
                  { kind: 'zilla', id: opened.id },
                  t('areaWhole', { district: t('districtName', { name: named(opened) }) }),
                )}
              </Group>
            ) : null}
            <Group title={t('areaThanas')}>
              {opened.thanas.map((thana) => pickRow({ kind: 'thana', id: thana.id }, named(thana)))}
            </Group>
          </>
        ) : (
          <>
            {/* The prototype's `.toolrow`: the box keeps its 44 px in a column. */}
            <div className="flex items-center gap-2">
              <SearchField
                value={typed}
                onChange={setTyped}
                placeholder={t('areaSearchPh')}
                label={t('areaSearchPh')}
              />
            </div>
            {cities.length > 0 ? (
              <Group title={t('areaCities')}>
                {cities.map((city) => pickRow({ kind: 'city', code: city.code }, named(city)))}
              </Group>
            ) : null}
            {zillas.length > 0 ? (
              <Group title={t('areaDistricts')}>{zillas.map(districtRow)}</Group>
            ) : null}
            {thanas.length > 0 ? (
              <Group title={t('areaThanas')}>
                {thanas.map(({ thana, zilla }) =>
                  pickRow({ kind: 'thana', id: thana.id }, `${named(thana)} · ${named(zilla)}`),
                )}
              </Group>
            ) : null}
            {nothing ? <p className="text-[14px] text-fg-muted">{t('areaNone')}</p> : null}
          </>
        )
      ) : null}
    </Sheet>
  );
}

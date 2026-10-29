import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { useSetHomeArea } from '@/api/delivery';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { RadioMark } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import type { DeliverySettings, Locations } from '@/types/delivery';
import { AreaSearchSheet } from '../set-up/area-search-sheet';
import {
  DEFAULT_HOME_AREA,
  featuredAreas,
  homeAreaInput,
  sameArea,
  type HomeArea,
} from '../set-up/home-areas';
import { AreaChips } from './area-chips';
import { AreaPickSheet } from './area-pick-sheet';
import { areaKey, inputOf, refsOf, sameRefs, type AreaRef } from './areas';
import { useDeliveryWords } from './delivery-words';

type Kind = DeliverySettings['homeArea']['kind'];
const KINDS: readonly [Kind, string][] = [
  ['city', 'haCity'],
  ['zilla', 'haZilla'],
  ['thanas', 'haThanas'],
];

/**
 * The home area (the prototype's `sh-homearea`, Part 22's `sh-homearea-thanas`; DLV-01): a city, a district, or the
 * shop's own thanas; a city or district from set-up's chips and search, the thanas from the area picker; the two zones'
 * names as they will read, with today's charges. The two zones are renamed unless the shop named them.
 */
export function HomeAreaSheet({
  open,
  settings,
  locations,
  charges,
  onClose,
}: {
  open: boolean;
  settings: DeliverySettings;
  locations: Locations;
  /** The two charges as the page holds them. */
  charges: { inside: string; outside: string };
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const words = useDeliveryWords();
  const save = useSetHomeArea();
  const home = settings.zones.find((zone) => zone.isHome);
  const [kind, setKind] = useState<Kind>('city');
  const [area, setArea] = useState<HomeArea>(DEFAULT_HOME_AREA);
  const [thanas, setThanas] = useState<AreaRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);

  const savedArea = (): HomeArea => {
    const city = home?.areas.cities[0];
    const zilla = home?.areas.zillas[0];
    return city
      ? { kind: 'city', code: city.code }
      : zilla
        ? { kind: 'zilla', id: zilla.id }
        : DEFAULT_HOME_AREA;
  };
  const savedThanas = home ? refsOf(home.areas).filter((ref) => ref.kind === 'thana') : [];

  useEffect(() => {
    if (!open) return;
    setKind(settings.homeArea.kind);
    setArea(savedArea());
    setThanas(savedThanas);
    setSearching(false);
    setPicking(false);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nameOf = (each: HomeArea): string => {
    const ref: AreaRef = each.kind === 'city' ? each : { kind: 'zilla', id: each.id };
    return words.area(locations, ref);
  };
  const featured = featuredAreas(locations).filter(
    (each) => each.kind === (kind === 'zilla' ? 'zilla' : 'city'),
  );
  const chips =
    featured.some((each) => sameArea(each, area)) ||
    area.kind !== (kind === 'zilla' ? 'zilla' : 'city')
      ? featured
      : [...featured, area];
  const chosenName =
    kind === 'thanas'
      ? words.listed(thanas.map((ref) => words.area(locations, ref)))
      : area.kind === (kind === 'zilla' ? 'zilla' : 'city')
        ? nameOf(area)
        : '';

  const changed =
    kind !== settings.homeArea.kind ||
    (kind === 'thanas' ? !sameRefs(thanas, savedThanas) : !sameArea(area, savedArea()));
  const ready =
    changed &&
    (kind === 'thanas' ? thanas.length > 0 : area.kind === (kind === 'zilla' ? 'zilla' : 'city'));

  return (
    <>
      <Sheet
        open={open && !searching && !picking}
        title={t('homeArea')}
        onClose={onClose}
        footer={
          <Button
            wide
            busy={save.isPending}
            disabled={!ready}
            onClick={() => {
              save.mutate(kind === 'thanas' ? { areas: inputOf(thanas) } : homeAreaInput(area), {
                onSuccess: onClose,
              });
            }}
          >
            {t('save')}
          </Button>
        }
      >
        {open ? (
          <>
            <div className="flex-none overflow-hidden rounded-card border border-line">
              <RowList>
                {KINDS.map(([each, word]) => (
                  <button
                    key={each}
                    type="button"
                    role="radio"
                    aria-checked={kind === each}
                    onClick={() => {
                      setKind(each);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-[15px] font-medium"
                  >
                    <RadioMark on={kind === each} />
                    {t(word)}
                  </button>
                ))}
              </RowList>
            </div>
            {kind === 'thanas' ? (
              <AreaChips
                refs={thanas}
                locations={locations}
                addLabel={t('addThana')}
                taken={new Set()}
                onRemove={(ref) => {
                  setThanas((now) => now.filter((each) => areaKey(each) !== areaKey(ref)));
                }}
                onAdd={() => {
                  setPicking(true);
                }}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {chips.map((each) => (
                  <Chip
                    key={each.kind === 'city' ? `c-${each.code}` : `z-${String(each.id)}`}
                    size="lg"
                    on={sameArea(each, area)}
                    onClick={() => {
                      setArea(each);
                    }}
                  >
                    {nameOf(each)}
                  </Chip>
                ))}
                <Chip
                  size="lg"
                  onClick={() => {
                    setSearching(true);
                  }}
                >
                  <Icon name="search" size={16} />
                  {t('haSearch')}
                </Chip>
              </div>
            )}
            {chosenName ? (
              <div className="num flex flex-col gap-1.5 rounded-[8px] border border-line bg-neutral-50 px-3 py-2.5 text-[14px]">
                <span>
                  <span className="text-[13px] text-fg-muted">
                    {words.automatic(kind, chosenName, 'inside')}
                  </span>
                  <br />
                  <span className="font-semibold">{formatTaka(charges.inside)}</span>
                </span>
                <span>
                  <span className="text-[13px] text-fg-muted">
                    {words.automatic(kind, chosenName, 'outside')}
                  </span>
                  <br />
                  <span className="font-semibold">{formatTaka(charges.outside)}</span>
                </span>
              </div>
            ) : null}
            <p className="text-[14px] text-fg-muted">{t('homeAreaNote')}</p>
            {save.isError ? <Banner tone="bad">{errorText(save.error)}</Banner> : null}
          </>
        ) : null}
      </Sheet>
      <AreaSearchSheet
        open={open && searching}
        locations={locations}
        nameOf={nameOf}
        onPick={(picked) => {
          setArea(picked);
          setKind(picked.kind);
          setSearching(false);
        }}
        onClose={() => {
          setSearching(false);
        }}
      />
      <AreaPickSheet
        open={open && picking}
        mode="thanas"
        title={t('addThana')}
        settings={settings}
        locations={locations}
        zoneId={home?.id ?? null}
        chosen={thanas}
        onAdd={(added) => {
          setThanas((now) => [
            ...now,
            ...added.filter((ref) => !now.some((each) => areaKey(each) === areaKey(ref))),
          ]);
          setPicking(false);
        }}
        onBack={() => {
          setPicking(false);
        }}
        onClose={() => {
          setPicking(false);
        }}
      />
    </>
  );
}

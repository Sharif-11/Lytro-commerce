import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/ui/sheet';
import type { Locations } from '@/types/delivery';
import type { HomeArea } from './home-areas';

interface AreaSearchSheetProps {
  open: boolean;
  locations: Locations;
  /** The area's name as the person reads it. */
  nameOf: (area: HomeArea) => string;
  onPick: (area: HomeArea) => void;
  onClose: () => void;
}

/** One group's rows: each a city or a district to tap. */
function AreaGroup({
  title,
  areas,
  nameOf,
  onPick,
}: {
  title: string;
  areas: HomeArea[];
  nameOf: (area: HomeArea) => string;
  onPick: (area: HomeArea) => void;
}): React.JSX.Element | null {
  if (areas.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-fg-muted">{title}</h3>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {areas.map((area) => (
          <button
            key={area.kind === 'city' ? `c-${area.code}` : `z-${String(area.id)}`}
            type="button"
            onClick={() => {
              onPick(area);
            }}
            className="flex min-h-12 w-full items-center border-t border-line px-4 text-left text-[15px] first:border-t-0 hover:bg-neutral-50"
          >
            {nameOf(area)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Set-up's "search a city or district" (DLV-01): all 11 city areas and 64 zillas, narrowed by the name typed in
 * either language. The prototype draws the chip that opens it; the sheet is the dashboard's own, in its sheet's form.
 */
export function AreaSearchSheet({
  open,
  locations,
  nameOf,
  onPick,
  onClose,
}: AreaSearchSheetProps): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const [query, setQuery] = useState('');
  const typed = query.trim().toLowerCase();
  const matches = (en: string, bn: string): boolean =>
    typed === '' || en.toLowerCase().includes(typed) || bn.includes(query.trim());

  const cities = locations.cities
    .filter((city) => matches(city.nameEn, city.nameBn))
    .map((city): HomeArea => ({ kind: 'city', code: city.code }));
  const zillas = locations.zillas
    .filter((zilla) => matches(zilla.nameEn, zilla.nameBn))
    .map((zilla): HomeArea => ({ kind: 'zilla', id: zilla.id }));

  return (
    <Sheet open={open} title={t('haSearch')} onClose={onClose}>
      <label className="flex h-11 items-center gap-2 rounded-button border border-line-strong bg-surface px-3 text-[16px] text-fg-subtle focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          placeholder={t('areaSearchPh')}
          aria-label={t('haSearch')}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>
      {cities.length === 0 && zillas.length === 0 ? (
        <p className="text-[14px] text-fg-muted">{t('areaNone')}</p>
      ) : null}
      <AreaGroup title={t('areaCities')} areas={cities} nameOf={nameOf} onPick={onPick} />
      <AreaGroup title={t('areaDistricts')} areas={zillas} nameOf={nameOf} onPick={onPick} />
    </Sheet>
  );
}

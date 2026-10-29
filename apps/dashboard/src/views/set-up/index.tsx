import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DEFAULT_FALLBACK_ZONE_CHARGE, DEFAULT_HOME_ZONE_CHARGE } from '@lytronix/validators';
import { formatTaka } from '@lytronix/ui';
import { useMe } from '@/api/me';
import { useLocations, useSetHomeArea } from '@/api/delivery';
import { usePresets, useSetBusinessType } from '@/api/shop-setup';
import { Icon } from '@/components/icon';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { useErrorText } from '@/hooks/use-error-text';
import { AreaSearchSheet } from './area-search-sheet';
import {
  DEFAULT_HOME_AREA,
  featuredAreas,
  homeAreaInput,
  sameArea,
  type HomeArea,
} from './home-areas';

/**
 * Step 4 (AUTH-28, PST-01, DLV-01; the prototype's `ob-setup`): what the shop mainly sells, from the operator's list
 * of shop types, and where it delivers from, as one city or one district -- the prototype's eight, or any other by
 * search -- with the two zones it makes previewed at the server's own charges. Both are skippable and changeable
 * later; Save sends only what differs from the shop's start (no type yet, Dhaka city), and Skip sends nothing.
 */
export function SetUp(): React.JSX.Element {
  const { t, i18n } = useTranslation('onboarding');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const me = useMe();
  const presets = usePresets();
  const locations = useLocations();
  const setBusinessType = useSetBusinessType();
  const setHomeArea = useSetHomeArea();
  const [shopType, setShopType] = useState<string | null>(null);
  const [area, setArea] = useState<HomeArea>(DEFAULT_HOME_AREA);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const bn = i18n.language === 'bn';
  const nameOf = (each: HomeArea): string => {
    if (each.kind === 'city') {
      const city = locations.data?.cities.find((item) => item.code === each.code);
      return city ? (bn ? city.nameBn : city.nameEn) : each.code;
    }
    const zilla = locations.data?.zillas.find((item) => item.id === each.id);
    return zilla ? t('districtName', { name: bn ? zilla.nameBn : zilla.nameEn }) : '';
  };

  const featured = locations.data ? featuredAreas(locations.data) : [];
  // An area picked by search joins the chips, chosen.
  const chips = featured.some((each) => sameArea(each, area)) ? featured : [...featured, area];

  function finish(): void {
    const slug = me.data?.tenant?.slug;
    if (slug) void navigate({ to: '/$shop', params: { shop: slug } });
    else void navigate({ to: '/shops' });
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        shopType === null ? null : setBusinessType.mutateAsync(shopType),
        sameArea(area, DEFAULT_HOME_AREA) ? null : setHomeArea.mutateAsync(homeAreaInput(area)),
      ]);
      finish();
    } catch (failure) {
      setError(failure);
      setSaving(false);
    }
  }

  const areaName = nameOf(area);

  return (
    <OnboardingFrame step={3} title={t('suTitle')} lead={t('suLead')}>
      <section>
        <h2 className="text-[16px] font-bold">{t('suQ1')}</h2>
        <p className="mt-0.5 mb-2.5 text-[14px] text-fg-muted">{t('suH1')}</p>
        <div className="flex flex-wrap gap-2">
          {(presets.data ?? []).map((preset) => (
            <Chip
              key={preset.key}
              size="lg"
              on={shopType === preset.key}
              onClick={() => {
                setShopType(shopType === preset.key ? null : preset.key);
              }}
            >
              {bn ? preset.labelBn : preset.labelEn}
            </Chip>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-[16px] font-bold">{t('suQ2')}</h2>
        <p className="mt-0.5 mb-2.5 text-[14px] text-fg-muted">{t('suH2')}</p>
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
          {locations.data ? (
            <Chip
              size="lg"
              onClick={() => {
                setSearching(true);
              }}
            >
              <Icon name="search" size={16} />
              {t('haSearch')}
            </Chip>
          ) : null}
        </div>
        <div className="num mt-2.5 flex flex-col gap-1.5 rounded-[8px] border border-line bg-neutral-50 px-3 py-2.5 text-[14px]">
          <span>
            <span className="text-[13px] text-fg-muted">{t('inside', { a: areaName })}</span>
            <br />
            <span className="font-semibold">{formatTaka(DEFAULT_HOME_ZONE_CHARGE)}</span>
          </span>
          <span>
            <span className="text-[13px] text-fg-muted">{t('outside', { a: areaName })}</span>
            <br />
            <span className="font-semibold">{formatTaka(DEFAULT_FALLBACK_ZONE_CHARGE)}</span>
          </span>
        </div>
        <p className="mt-0.5 mb-2.5 text-[14px] text-fg-muted">{t('suNote')}</p>
      </section>
      {error ? <Banner tone="bad">{errorText(error)}</Banner> : null}
      <Button
        wide
        busy={saving}
        onClick={() => {
          void save();
        }}
      >
        {t('suSubmit')}
      </Button>
      <StepLinks>
        <button type="button" onClick={finish}>
          {t('pwSkip')}
        </button>
      </StepLinks>
      {locations.data ? (
        <AreaSearchSheet
          open={searching}
          locations={locations.data}
          nameOf={nameOf}
          onPick={(picked) => {
            setArea(picked);
            setSearching(false);
          }}
          onClose={() => {
            setSearching(false);
          }}
        />
      ) : null}
    </OnboardingFrame>
  );
}

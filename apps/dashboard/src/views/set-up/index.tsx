import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/me';
import { Button, Chip, formatTaka } from '@lytronix/ui';
import { StepFrame } from '@/components/ui/step-frame';
import {
  DEFAULT_ZONE_CHARGES,
  HOME_AREAS,
  SHOP_TYPES,
  shopSetupStore,
  type HomeArea,
  type ShopType,
} from '@/session/shop-setup-store';

/**
 * Step 4 (AUTH-28): what the shop mainly sells (PST-01) and where it delivers from (DLV-01), both skippable
 * and changeable later. The two default zones preview as the owner picks, so the shop sells with no
 * further setup. Skipping keeps the defaults. The answers are held on this device until the Phase 3
 * endpoints exist (session/shop-setup-store.ts).
 */
export function SetUp(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const [shopType, setShopType] = useState<ShopType | null>(null);
  const [homeArea, setHomeArea] = useState<HomeArea>('dhaka_city');

  const slug = me.data?.tenant?.slug ?? null;

  function finish(save: boolean): void {
    if (slug) {
      shopSetupStore.update(slug, {
        shopType: save ? shopType : null,
        homeArea: save ? homeArea : 'dhaka_city',
        setUpDone: true,
      });
      void navigate({ to: '/$shop', params: { shop: slug } });
    } else {
      void navigate({ to: '/shops' });
    }
  }

  const areaName = t(`setUp.areas.${homeArea}`);

  return (
    <StepFrame
      step="setUp"
      title={t('setUp.title')}
      lead={t('setUp.lead')}
      footer={
        <button
          type="button"
          className="min-h-10 font-semibold text-brand-800 underline"
          onClick={() => {
            finish(false);
          }}
        >
          {t('setUp.skip')}
        </button>
      }
    >
      <div className="space-y-7">
        <section>
          <h2 className="text-[16px] font-bold text-ink">{t('setUp.shopTypeQuestion')}</h2>
          <p className="mt-1 text-[14px] text-neutral-700">{t('setUp.shopTypeHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SHOP_TYPES.map((type) => (
              <Chip
                key={type}
                selected={shopType === type}
                onClick={() => {
                  setShopType(shopType === type ? null : type);
                }}
              >
                {t(`setUp.types.${type}`)}
              </Chip>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-ink">{t('setUp.homeAreaQuestion')}</h2>
          <p className="mt-1 text-[14px] text-neutral-700">{t('setUp.homeAreaHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {HOME_AREAS.map((area) => (
              <Chip
                key={area}
                selected={homeArea === area}
                onClick={() => {
                  setHomeArea(area);
                }}
              >
                {t(`setUp.areas.${area}`)}
              </Chip>
            ))}
          </div>
          <dl className="num mt-4 grid grid-cols-2 gap-2 text-[14px]">
            <div className="rounded-card border border-line bg-neutral-50 px-3.5 py-3">
              <dt className="text-neutral-700">{t('setUp.insideZone', { area: areaName })}</dt>
              <dd className="mt-1 text-[20px] font-bold text-ink">
                {formatTaka(DEFAULT_ZONE_CHARGES.inside)}
              </dd>
            </div>
            <div className="rounded-card border border-line bg-neutral-50 px-3.5 py-3">
              <dt className="text-neutral-700">{t('setUp.outsideZone', { area: areaName })}</dt>
              <dd className="mt-1 text-[20px] font-bold text-ink">
                {formatTaka(DEFAULT_ZONE_CHARGES.outside)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[13px] text-neutral-700">{t('setUp.zonesNote')}</p>
        </section>

        <Button
          type="button"
          onClick={() => {
            finish(true);
          }}
        >
          {t('setUp.submit')}
        </Button>
      </div>
    </StepFrame>
  );
}

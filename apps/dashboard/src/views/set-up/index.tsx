import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useHome } from '@/api/home';
import { useMe } from '@/api/me';
import { usePresets, useSetBusinessType } from '@/api/shop-setup';
import { ErrorBanner } from '@/components/error-banner';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';

/**
 * Step 4 (AUTH-28, PST-01; the prototype's `ux-setup`, Fixes · UI/UX batch 2, item 1.6): one question -- what the shop
 * mainly sells, from the operator's list of shop types. Skippable and changeable later; Skip sends nothing. Where the
 * shop delivers from is no longer asked: the shop starts with the Dhaka city zones the server makes the first time
 * they are asked for, changed later in Delivery. Then a brand-new shop with no products lands on quick add, to add its
 * first product and share the link (the owner, 2026-11-25; TENANT-DASHBOARD-DESIGN §7.4b `pq-first`); one that already
 * has products goes Home.
 */
export function SetUp(): React.JSX.Element {
  const { t, i18n } = useTranslation('onboarding');
  const navigate = useNavigate();
  const me = useMe();
  const presets = usePresets();
  const setBusinessType = useSetBusinessType();
  const [shopType, setShopType] = useState<string | null>(null);
  const bn = i18n.language === 'bn';
  // Read while the owner picks: whether the shop has products yet. Unknown counts as none -- this is onboarding's end.
  const home = useHome({ enabled: Boolean(me.data?.tenant) });

  async function finish(): Promise<void> {
    const slug = me.data?.tenant?.slug;
    if (!slug) {
      void navigate({ to: '/shops' });
      return;
    }
    // Not read yet (Skip pressed at once): asked now, so a shop with products never lands on quick add.
    const view = home.isSuccess ? home.data : (await home.refetch()).data;
    if ((view?.products?.total ?? 0) > 0) {
      void navigate({ to: '/$shop', params: { shop: slug } });
    } else {
      void navigate({ to: '/$shop/products/new', params: { shop: slug }, search: { first: 1 } });
    }
  }

  function save(): void {
    if (shopType === null) {
      void finish();
      return;
    }
    setBusinessType.mutate(shopType, {
      onSuccess: () => {
        void finish();
      },
    });
  }

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
      {setBusinessType.isError ? <ErrorBanner error={setBusinessType.error} /> : null}
      <Button wide busy={setBusinessType.isPending} onClick={save}>
        {t('suSubmit')}
      </Button>
      <StepLinks>
        <button
          type="button"
          onClick={() => {
            void finish();
          }}
        >
          {t('suSkip')}
        </button>
      </StepLinks>
    </OnboardingFrame>
  );
}

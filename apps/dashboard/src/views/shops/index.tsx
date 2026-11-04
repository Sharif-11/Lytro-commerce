import { useEffect } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/me';
import { Icon } from '@/components/icon';
import { BareFrame, OnboardingFrame, Spinner } from '@/components/onboarding/frame';
import { Banner } from '@/components/ui/banner';
import { RowList, RowText, rowClass } from '@/components/ui/list-row';
import { ShopMark } from '@/components/ui/shop-mark';
import { useErrorText } from '@/hooks/use-error-text';
import { appConfig } from '@/lib/app-config';

/**
 * TEN-31, TEN-15: the landing after any sign-in. `/me` lists the shops the person may open: one opens at once,
 * several show the picker (the prototype's `shops`, with each shop's address and the person's role there, and no "new
 * shop"), none goes to create-shop (AUTH-12). "Opening your shop" shows while `/me` answers.
 */
export function Shops(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const me = useMe();
  const shops = me.data?.shops ?? null;
  const only = shops?.length === 1 ? shops[0] : null;

  useEffect(() => {
    if (!shops) return;
    if (only) void navigate({ to: '/$shop', params: { shop: only.slug }, replace: true });
    else if (shops.length === 0) void navigate({ to: '/create-shop', replace: true });
  }, [shops, only, navigate]);

  if (shops && shops.length > 1) {
    return (
      <BareFrame>
        <h1 className="text-center text-[22px] font-bold">{t('shopsTitle')}</h1>
        <RowList className="overflow-hidden rounded-card border border-line bg-surface">
          {shops.map((shop) => (
            <Link key={shop.slug} to="/$shop" params={{ shop: shop.slug }} className={rowClass}>
              <ShopMark shopName={shop.shopName} slug={shop.slug} logo={null} size={40} />
              <RowText
                title={shop.shopName}
                sub={`${appConfig.shopHost(shop.slug)} · ${shop.role === 'owner' ? t('roleOwner') : t('roleStaff')}`}
              />
              <Icon name="right" />
            </Link>
          ))}
        </RowList>
      </BareFrame>
    );
  }

  return (
    <OnboardingFrame title={t('shopsOpening')}>
      {me.isError ? <Banner tone="bad">{errorText(me.error)}</Banner> : <Spinner />}
    </OnboardingFrame>
  );
}

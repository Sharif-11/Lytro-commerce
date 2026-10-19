import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/me';
import { Notice } from '@lytronix/ui';
import { PENDING_PAYMENT_KEY } from '@/views/checkout';
import { shopSetupStore, type ShopSetup } from '@/session/shop-setup-store';
import { SetupChecklist } from './setup-checklist';
import { ShopLinkCard } from './shop-link-card';
import { TodayCard } from './today-card';

function readPendingPayment(): boolean {
  try {
    return sessionStorage.getItem(PENDING_PAYMENT_KEY) !== null;
  } catch {
    return false;
  }
}

/** Home, day one (ONBOARDING-FLOW-DESIGN §3): the setup checklist, the shop link card and the empty Today
    card. The trial banner lives in the shell. A shop that paid at checkout sees the payment-being-checked
    note until /me reports the plan. */
export function DashboardHome(): React.JSX.Element {
  const { t } = useTranslation();
  const { shop } = useParams({ from: '/$shop/' });
  const me = useMe();
  const [setup, setSetup] = useState<ShopSetup>(() => shopSetupStore.read(shop));
  const tenant = me.data?.tenant ?? null;
  const pendingPayment = readPendingPayment() && tenant?.planName === null;

  return (
    <div className="mx-auto w-full max-w-[960px] space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <h1 className="heading text-[22px] text-ink">{t('home.title')}</h1>
      {pendingPayment ? <Notice tone="info">{t('home.paymentBeingChecked')}</Notice> : null}
      <SetupChecklist slug={shop} setup={setup} />
      <ShopLinkCard
        slug={shop}
        onShared={() => {
          setSetup(shopSetupStore.update(shop, { sharedLink: true }));
        }}
      />
      <TodayCard />
    </div>
  );
}

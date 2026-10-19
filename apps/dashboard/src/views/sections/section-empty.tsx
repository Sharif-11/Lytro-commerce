import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@lytronix/ui';
import type { ShopSection } from '@/components/layout/nav-items';

const icons: Record<Exclude<ShopSection, 'home' | 'more'>, IconName> = {
  orders: 'orders',
  products: 'box',
  customers: 'users',
  balance: 'wallet',
};

/** A section's first-run state (ONBOARDING-FLOW-DESIGN §3, "Empty states"). These screens' working forms
    arrive with their modules (Phase 3 Slice 11 and later); until then each says plainly what it will hold. */
export function SectionEmpty({ section }: { section: keyof typeof icons }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-5 sm:px-6 sm:py-6">
      <h1 className="heading text-[22px] text-ink">{t(`nav.${section}`)}</h1>
      <div className="mt-5 flex flex-col items-center rounded-card border border-dashed border-neutral-200 bg-white px-5 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon name={icons[section]} size={26} />
        </span>
        <p className="mt-4 text-[16px] font-bold text-ink">{t(`sections.${section}.emptyTitle`)}</p>
        <p className="mt-1 max-w-[360px] text-[14px] text-neutral-700">
          {t(`sections.${section}.emptyLead`)}
        </p>
      </div>
    </div>
  );
}

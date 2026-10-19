import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka, Icon, type IconName } from '@lytronix/ui';
import { DEFAULT_ZONE_CHARGES, type ShopSetup } from '@/session/shop-setup-store';

interface ChecklistItem {
  key: string;
  icon: IconName;
  done: boolean;
  detail?: string;
  to?: 'home' | 'products';
}

/**
 * SUP-01: each item's state is detected, with a progress bar. Only items whose feature is live are listed
 * (ONBOARDING-FLOW-DESIGN §6): add-product, logo, wallet, courier, listener, SMS and API key join the list
 * as their modules ship, so the checklist never promises a screen that is not there.
 */
export function SetupChecklist({
  slug,
  setup,
}: {
  slug: string;
  setup: ShopSetup;
}): React.JSX.Element {
  const { t } = useTranslation();
  const area = t(`setUp.areas.${setup.homeArea}`);
  const items: ChecklistItem[] = [
    { key: 'shopCreated', icon: 'store', done: true },
    {
      key: 'deliveryCharges',
      icon: 'truck',
      done: true,
      detail: t('home.checklist.deliveryDetail', {
        area,
        inside: formatTaka(DEFAULT_ZONE_CHARGES.inside),
        outside: formatTaka(DEFAULT_ZONE_CHARGES.outside),
      }),
    },
    { key: 'shareLink', icon: 'share', done: setup.sharedLink, to: 'home' },
  ];
  const done = items.filter((item) => item.done).length;

  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold text-ink">{t('home.checklist.title')}</h2>
        <span className="num text-[13px] font-semibold text-neutral-700">
          {done}/{items.length}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
        <div
          className="h-full rounded-full bg-brand-700 transition-all"
          style={{ width: `${String(Math.round((done / items.length) * 100))}%` }}
        />
      </div>
      <ul className="mt-4 divide-y divide-line">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-3 py-3">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                item.done ? 'bg-success-soft text-success' : 'bg-neutral-100 text-neutral-700'
              }`}
            >
              <Icon name={item.done ? 'check' : item.icon} size={16} strokeWidth={2.5} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[15px] font-semibold ${item.done ? 'text-neutral-700 line-through' : 'text-ink'}`}
              >
                {t(`home.checklist.${item.key}`)}
              </p>
              {item.detail ? <p className="text-[13px] text-neutral-700">{item.detail}</p> : null}
            </div>
            {!item.done && item.to === 'products' ? (
              <Link
                to="/$shop/products"
                params={{ shop: slug }}
                className="inline-flex min-h-9 items-center text-[13px] font-bold text-brand-800"
              >
                {t('home.checklist.open')}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-neutral-700">{t('home.checklist.moreLater')}</p>
    </section>
  );
}

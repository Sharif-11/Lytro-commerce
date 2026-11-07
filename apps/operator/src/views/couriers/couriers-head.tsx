import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { chipClass } from '@/components/ui/chip-class';
import { Chips } from '@/components/ui/chips';
import { PageTitle } from '@/components/ui/console-page';

const TABS = [
  { to: '/couriers', key: 'couriers', word: 'couriers.tabCouriers' },
  { to: '/couriers/redx-areas', key: 'areas', word: 'couriers.tabAreas' },
] as const;

/** OPERATOR-CONSOLE-DESIGN §10b: the head the couriers and RedX's areas share, as Lytro's phones has. */
export function CouriersHead({
  active,
}: {
  active: (typeof TABS)[number]['key'];
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <PageTitle title={t('nav.couriers')} lead={t('couriers.lead')} />
      <Chips>
        {TABS.map((tab) => (
          <Link key={tab.key} to={tab.to} className={chipClass(active === tab.key)}>
            {t(tab.word)}
          </Link>
        ))}
      </Chips>
    </>
  );
}

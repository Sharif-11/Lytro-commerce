import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** The title, the one primary action, and the People / Roles segments every Team screen opens with. */
export function TeamHeader({
  shop,
  segment,
  action,
}: {
  shop: string;
  segment: 'people' | 'roles';
  action: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const tab = (active: boolean): string =>
    `rounded-[9px] px-3 py-2 text-center text-[15px] font-semibold ${
      active ? 'bg-white text-ink shadow-card' : 'text-neutral-700'
    }`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="heading text-[22px] text-ink">{t('team.title')}</h1>
        {action}
      </div>
      <div className="grid grid-cols-2 rounded-[12px] bg-neutral-100 p-1">
        <Link to="/$shop/team" params={{ shop }} className={tab(segment === 'people')}>
          {t('team.people')}
        </Link>
        <Link to="/$shop/team/roles" params={{ shop }} className={tab(segment === 'roles')}>
          {t('team.roles')}
        </Link>
      </div>
    </div>
  );
}

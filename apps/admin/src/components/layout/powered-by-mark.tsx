import { useTranslation } from 'react-i18next';

/** TEN-18: a small, persistent mark the tenant cannot remove. No settings, no dismiss control — if it needs
    to not render somewhere, that's a decision made by not rendering this component there, not a prop on it. */
export function PoweredByMark(): React.JSX.Element {
  const { t } = useTranslation();
  return <p className="text-center text-xs text-slate-400">{t('common.poweredBy')}</p>;
}

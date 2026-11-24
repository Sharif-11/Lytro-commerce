import { useTranslation } from 'react-i18next';

/** The sketch's `.new` (lytro-payg.html): a small pill after a row's name, for what fair use brings. */
export function NewBadge(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <span className="ml-1.5 inline-block rounded-full bg-brand-100 px-[7px] py-0.5 align-middle text-[11px] font-bold text-brand-800">
      {t('common.new')}
    </span>
  );
}

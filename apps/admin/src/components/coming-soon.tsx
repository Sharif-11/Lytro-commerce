import { useTranslation } from 'react-i18next';

interface ComingSoonProps {
  titleKey: string;
}

/** A placeholder for a dashboard section whose nav destination exists before its real screen does (staff,
    roles, activity) — kept generic and reused rather than three near-identical one-off components, since
    right now the three really are the same thing: "this exists, the real screen is next." */
export function ComingSoon({ titleKey }: ComingSoonProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
      <h1 className="text-xl font-bold text-slate-900">{t(titleKey)}</h1>
      <p className="mt-2 text-sm text-slate-500">{t('dashboard.comingSoon')}</p>
    </div>
  );
}

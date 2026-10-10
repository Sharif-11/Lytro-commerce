import { useTranslation } from 'react-i18next';

interface BrandMarkProps {
  compact?: boolean;
}

/** Lytro commerce's own identity (not Lytronix's) — used by AuthCard and the dashboard shell alike, so it
    stays one definition instead of drifting into two copies as more screens need it. */
export function BrandMark({ compact = false }: BrandMarkProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 font-bold text-white shadow-md shadow-brand-600/30 ${
          compact ? 'h-8 w-8 text-sm' : 'h-9 w-9 text-base'
        }`}
      >
        L
      </span>
      <span
        className={`font-bold tracking-tight text-slate-900 ${compact ? 'text-base' : 'text-lg'}`}
      >
        {t('common.appName')}
      </span>
    </div>
  );
}

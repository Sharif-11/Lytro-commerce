import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '@/i18n';

const OPTIONS: Language[] = ['bn', 'en'];

/** I18N-01's toggle — switches every visible label (react-i18next re-renders every useTranslation() caller
    on i18n.changeLanguage(), so reading i18n.language here is enough to stay in sync, no local state). */
export function LanguageToggle(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const current = i18n.language;

  return (
    <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
      {OPTIONS.map((language) => (
        <button
          key={language}
          type="button"
          onClick={() => {
            setLanguage(language);
          }}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            current === language ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          {t(`language.${language}`)}
        </button>
      ))}
    </div>
  );
}

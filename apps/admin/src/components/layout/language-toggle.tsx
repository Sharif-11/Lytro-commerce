import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '@/i18n';
import { LanguageIcon } from '@/components/icons';

interface LanguageToggleProps {
  /** For placement on a dark surface (the sidebar) — borders and dimmed label invert too. */
  inverted?: boolean;
}

/** I18N-01's toggle — a single pill that flips the language on click, not two selectable segments, matching
    the reference dashboard's own LanguageToggle (an icon plus "EN / বাংলা" with the active one bold). Reads
    i18n.language directly (react-i18next re-renders every useTranslation() caller on changeLanguage(), so
    no local state is needed to stay in sync). */
export function LanguageToggle({ inverted = false }: LanguageToggleProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const current = i18n.language as Language;
  const other: Language = current === 'en' ? 'bn' : 'en';

  return (
    <button
      type="button"
      onClick={() => {
        setLanguage(other);
      }}
      title={t(`language.switchTo.${other}`)}
      aria-label={t('common.language')}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
        inverted
          ? 'border-sidebar-line bg-sidebar-alt text-white/50 hover:bg-white/5'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
      }`}
    >
      <LanguageIcon className="h-3.5 w-3.5 shrink-0 text-brand-500" />
      <span
        className={
          current === 'en' ? `font-semibold ${inverted ? 'text-white' : 'text-slate-800'}` : ''
        }
      >
        EN
      </span>
      <span className={inverted ? 'text-white/30' : 'text-slate-300'}>/</span>
      <span
        className={
          current === 'bn' ? `font-semibold ${inverted ? 'text-white' : 'text-slate-800'}` : ''
        }
      >
        {t('language.bn')}
      </span>
    </button>
  );
}

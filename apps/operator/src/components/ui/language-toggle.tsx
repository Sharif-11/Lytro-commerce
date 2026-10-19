import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '@/i18n';

/** EN / বাং. The console is English-leaning (BRAND-IDENTITY §8.4) but carries both, per device (I18N-02). */
export function LanguageToggle(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const current: Language = i18n.language === 'bn' ? 'bn' : 'en';

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className="inline-flex h-10 items-center rounded-full border border-line-strong p-1 text-[13px] font-bold"
    >
      {(['en', 'bn'] as const).map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === current}
          onClick={() => {
            if (option !== current) setLanguage(option);
          }}
          className={`h-8 min-w-11 rounded-full px-3 transition-colors ${
            option === current ? 'bg-brand-400 text-ink' : 'text-fg-muted hover:text-fg'
          }`}
        >
          {option === 'bn' ? 'বাং' : 'EN'}
        </button>
      ))}
    </div>
  );
}

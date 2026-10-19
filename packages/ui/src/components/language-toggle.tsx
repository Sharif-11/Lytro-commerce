import { useTranslation } from 'react-i18next';
import { defaultLanguageOf, type Language } from '../language';

/**
 * বাং / EN, the same control the marketing site has (I18N-01, per device I18N-02). The app's default language
 * comes first: বাং / EN on the dashboard, EN / বাং on the English-leaning console (BRAND-IDENTITY §8.4).
 * `light` is for the dashboard's teal chrome.
 */
export function LanguageToggle({ tone = 'dark' }: { tone?: 'dark' | 'light' }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const first = defaultLanguageOf(i18n);
  const second: Language = first === 'bn' ? 'en' : 'bn';
  const current: Language = i18n.language === second ? second : first;
  const shell =
    tone === 'dark' ? 'border-control-line bg-control' : 'border-on-chrome/30 bg-on-chrome/10';
  const active = tone === 'dark' ? 'bg-primary text-on-primary' : 'bg-on-chrome text-chrome';
  const idle = tone === 'dark' ? 'text-fg-muted hover:text-fg-muted-hover' : 'text-on-chrome/85';

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={`inline-flex h-10 items-center rounded-full border p-1 text-[13px] font-bold ${shell}`}
    >
      {[first, second].map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === current}
          onClick={() => {
            if (option !== current) void i18n.changeLanguage(option);
          }}
          className={`h-8 min-w-11 rounded-full px-3 transition-colors ${option === current ? active : idle}`}
        >
          {option === 'bn' ? 'বাং' : 'EN'}
        </button>
      ))}
    </div>
  );
}

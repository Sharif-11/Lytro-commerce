import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '@/i18n';

/** বাং / EN, the same control the marketing site has (I18N-01, per device I18N-02). */
export function LanguageToggle({ tone = 'dark' }: { tone?: 'dark' | 'light' }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const current: Language = i18n.language === 'en' ? 'en' : 'bn';
  const shell = tone === 'dark' ? 'border-neutral-200 bg-white' : 'border-white/30 bg-white/10';
  const active = tone === 'dark' ? 'bg-brand-700 text-white' : 'bg-white text-brand-900';
  const idle = tone === 'dark' ? 'text-neutral-700' : 'text-white/85';

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={`inline-flex h-10 items-center rounded-full border p-1 text-[13px] font-bold ${shell}`}
    >
      {(['bn', 'en'] as const).map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === current}
          onClick={() => {
            if (option !== current) setLanguage(option);
          }}
          className={`h-8 min-w-11 rounded-full px-3 transition-colors ${option === current ? active : idle}`}
        >
          {option === 'bn' ? 'বাং' : 'EN'}
        </button>
      ))}
    </div>
  );
}

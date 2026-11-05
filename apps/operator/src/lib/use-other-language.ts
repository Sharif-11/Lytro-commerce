import { useTranslation } from 'react-i18next';
import type { Language } from '@lytronix/ui';

/** The language this console is not in, named in its own script, and the switch to it (I18N-02: per device). */
export function useOtherLanguage(): { lang: Language; label: string; change: () => void } {
  const { i18n } = useTranslation();
  const lang: Language = i18n.language === 'bn' ? 'en' : 'bn';
  return {
    lang,
    label: lang === 'bn' ? 'বাংলা' : 'English',
    change: () => {
      void i18n.changeLanguage(lang);
    },
  };
}

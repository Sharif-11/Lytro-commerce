import type { i18n as I18n, Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

export type Language = 'bn' | 'en';

export interface LanguageSettings {
  /** What a first visit sees, and the fallback for a missing key. */
  defaultLanguage: Language;
  /** Where this app remembers the choice: its own key, so the console's choice never changes the dashboard's. */
  storageKey: string;
}

function isLanguage(value: unknown): value is Language {
  return value === 'bn' || value === 'en';
}

/** I18N-02: the language this device last chose for the app, or the app's default. */
export function storedLanguage(settings: LanguageSettings): Language {
  try {
    const stored = localStorage.getItem(settings.storageKey);
    return isLanguage(stored) ? stored : settings.defaultLanguage;
  } catch {
    return settings.defaultLanguage;
  }
}

/**
 * I18N-01, I18N-02: starts i18next on the language this device last chose, keeps `<html lang>` in step (the
 * Bangla font and line height hang off it), and remembers each later switch on this device, not per account.
 */
export function startLanguage(i18n: I18n, settings: LanguageSettings, resources: Resource): void {
  const initial = storedLanguage(settings);
  void i18n.use(initReactI18next).init({
    resources,
    lng: initial,
    fallbackLng: settings.defaultLanguage,
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = initial;
  i18n.on('languageChanged', (language) => {
    if (!isLanguage(language)) return;
    document.documentElement.lang = language;
    if (language === storedLanguage(settings)) return;
    try {
      localStorage.setItem(settings.storageKey, language);
    } catch {
      // A blocked storage only loses the memory of the choice, never the switch itself.
    }
  });
}

/** The app's default language, which its language toggle shows first. */
export function defaultLanguageOf(i18n: I18n): Language {
  const fallback: unknown = i18n.options.fallbackLng;
  const first: unknown = Array.isArray(fallback) ? (fallback as unknown[])[0] : fallback;
  return first === 'en' ? 'en' : 'bn';
}

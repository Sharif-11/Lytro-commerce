import { createInstance } from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultLanguageOf, startLanguage, storedLanguage, type LanguageSettings } from '../src';

const DASHBOARD: LanguageSettings = { defaultLanguage: 'bn', storageKey: 'test.language' };
const CONSOLE: LanguageSettings = { defaultLanguage: 'en', storageKey: 'test.console.language' };
const resources = {
  bn: { translation: { hello: 'হ্যালো' } },
  en: { translation: { hello: 'Hello' } },
};

afterEach(() => {
  localStorage.clear();
});

describe('the language a device remembers (I18N-02)', () => {
  it("starts on the app's default, and on the device's last choice once there is one", async () => {
    const first = createInstance();
    startLanguage(first, DASHBOARD, resources);
    expect(first.language).toBe('bn');
    expect(document.documentElement.lang).toBe('bn');
    expect(localStorage.getItem(DASHBOARD.storageKey)).toBeNull();

    await first.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
    expect(storedLanguage(DASHBOARD)).toBe('en');

    const next = createInstance();
    startLanguage(next, DASHBOARD, resources);
    expect(next.language).toBe('en');
  });

  it("keeps each app's choice apart", async () => {
    const operator = createInstance();
    startLanguage(operator, CONSOLE, resources);
    await operator.changeLanguage('bn');
    expect(storedLanguage(CONSOLE)).toBe('bn');
    expect(localStorage.getItem(DASHBOARD.storageKey)).toBeNull();
  });

  it('ignores a stored value that is not a language', () => {
    localStorage.setItem(DASHBOARD.storageKey, 'fr');
    expect(storedLanguage(DASHBOARD)).toBe('bn');
  });

  it("knows the app's default, which its toggle shows first", () => {
    const dashboard = createInstance();
    startLanguage(dashboard, DASHBOARD, resources);
    const operator = createInstance();
    startLanguage(operator, CONSOLE, resources);
    expect(defaultLanguageOf(dashboard)).toBe('bn');
    expect(defaultLanguageOf(operator)).toBe('en');
  });
});

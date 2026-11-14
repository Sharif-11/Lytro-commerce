import { describe, expect, it } from 'vitest';
import { AppConfig } from '../src/lib/app-config';

// One dashboard build serves staging and production (Phase 9 §3.6): it takes its platform domain from the address it is
// served on, so nothing about an environment is baked into the build.
const noSettings = {} as ImportMetaEnv;

describe('the dashboard names shops after the domain it is served on', () => {
  it('on staging, app.staging.lytro.app names shops <slug>.staging.lytro.app', () => {
    const config = new AppConfig(noSettings, 'app.staging.lytro.app');

    expect(config.shopHost('megh')).toBe('megh.staging.lytro.app');
    expect(config.dashboardAddress('megh')).toBe('app.staging.lytro.app/megh');
    expect(config.termsUrl()).toBe('https://staging.lytro.app/terms');
  });

  it('in production, app.lytro.app names shops <slug>.lytro.app', () => {
    const config = new AppConfig(noSettings, 'app.lytro.app');

    expect(config.shopUrl('megh')).toBe('https://megh.lytro.app');
    expect(config.contactUrl()).toBe('https://lytro.app/contact');
  });

  it('on another address (development), lytro.app unless a build setting names the domain', () => {
    expect(new AppConfig(noSettings, 'localhost').platformDomain).toBe('lytro.app');
    const named = new AppConfig(
      { VITE_PLATFORM_DOMAIN: 'lytro.test', VITE_SITE_URL: 'https://site.test/' } as ImportMetaEnv,
      'app.staging.lytro.app',
    );
    expect(named.platformDomain).toBe('lytro.test');
    expect(named.siteUrl).toBe('https://site.test');
  });

  it('names the server its errors come from by its address, and sends none without a Sentry address (OBS-03)', () => {
    expect(new AppConfig(noSettings, 'app.lytro.app').environment).toBe('production');
    expect(new AppConfig(noSettings, 'app.staging.lytro.app').environment).toBe('staging');
    expect(new AppConfig(noSettings, 'localhost').environment).toBe('development');
    expect(new AppConfig(noSettings, 'app.lytro.app').sentryDsn).toBeNull();
    const built = new AppConfig(
      {
        VITE_SENTRY_DSN: 'https://public@sentry.example/2',
        VITE_RELEASE: '854f8a0b',
      } as ImportMetaEnv,
      'app.lytro.app',
    );
    expect([built.sentryDsn, built.release]).toEqual([
      'https://public@sentry.example/2',
      '854f8a0b',
    ]);
  });
});

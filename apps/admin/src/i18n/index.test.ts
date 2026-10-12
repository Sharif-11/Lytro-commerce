import { beforeEach, describe, expect, it } from 'vitest';
import i18n, { getLanguage, setLanguage } from './index';

// I18N-01, I18N-02, D31 (P1-E29, P1-E30). D31 revised the original per-account design to per-device,
// client-side storage — these tests cover the design as it actually ships, not the pre-D31 wording still in
// PHASE-1-TEST-PLAN.md's P1-E30 (corrected there alongside this test; see that file's note on D31).
describe('language choice (I18N-01, I18N-02, D31)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to Bangla when nothing has been chosen on this device', () => {
    expect(getLanguage()).toBe('bn');
  });

  it('switching the toggle changes every visible label by changing i18n.language itself', () => {
    setLanguage('en');
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    setLanguage('bn');
    expect(i18n.language).toBe('bn');
  });

  it('the choice survives a reload on this device', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
  });

  it('the choice does not follow to a different device (D31: per device, not per account)', () => {
    setLanguage('en');
    // A different browser/device has its own, empty localStorage — nothing to carry the choice over.
    localStorage.clear();
    expect(getLanguage()).toBe('bn');
  });
});

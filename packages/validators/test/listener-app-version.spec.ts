import { describe, expect, it } from 'vitest';
import { appBuildVersionField, appVersionField, compareAppVersions } from '../src';

// LSN-18 (small fixes, 2026-11-13): the version a phone's app gives may carry one tag, as staging's build is
// `1.0.0-staging`, and is compared to the operator's minimum by its numbers alone; the minimum stays numbers only.
const accepts = (field: typeof appVersionField, value: string) => field.safeParse(value).success;

describe("a phone's app version (LSN-18)", () => {
  it.each(['1.0.0', '1.0.0-staging', '12.3.456-beta2', ' 1.2.0 '])('takes %s', (value) => {
    expect(accepts(appBuildVersionField, value)).toBe(true);
  });

  it.each([
    ['no tag after the dash', '1.0.0-'],
    ['two tags', '1.0.0-staging-x'],
    ['a tag with a space', '1.0.0-two words'],
    ['two numbers', '1.0'],
    ['a loose word', 'latest'],
    ["longer than a phone's row keeps", `1.0.0-${'a'.repeat(20)}`],
  ])('refuses %s', (_name, value) => {
    expect(accepts(appBuildVersionField, value)).toBe(false);
  });

  it("keeps the operator's minimum numbers only", () => {
    expect(accepts(appVersionField, '1.2.0')).toBe(true);
    expect(accepts(appVersionField, '1.2.0-staging')).toBe(false);
  });
});

describe('comparing versions (LSN-18)', () => {
  it('compares the three numbers in order', () => {
    expect(compareAppVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareAppVersions('1.1.9', '1.2.0')).toBeLessThan(0);
    expect(compareAppVersions('2.0.0', '2.0.0')).toBe(0);
  });

  it("counts a tag for nothing, so staging's build meets the minimum its numbers meet", () => {
    expect(compareAppVersions('1.0.0-staging', '1.0.0')).toBe(0);
    expect(compareAppVersions('1.2.0-staging', '1.1.9')).toBeGreaterThan(0);
    expect(compareAppVersions('1.1.9-staging', '1.2.0')).toBeLessThan(0);
  });
});

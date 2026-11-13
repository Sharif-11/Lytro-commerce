import { describe, expect, it } from 'vitest';
import { listenerReleaseOf } from '../src';

// SITE-PAGES-DESIGN §6, TENANT-DASHBOARD-DESIGN §7.44: the one check of `latest.json` that the website's listener page
// and the dashboard's download (through GET /listener/app) share.
const BASE = 'https://download.lytro.app';
const GOOD = {
  version: '1.2.3',
  file: 'lytro-listener-1.2.3.apk',
  sha256: 'a'.repeat(64),
  bytes: 9_000_000,
};

describe("the listener app's release", () => {
  it('reads a release, the file always on the host', () => {
    expect(listenerReleaseOf(GOOD, BASE)).toEqual({
      version: '1.2.3',
      url: `${BASE}/lytro-listener-1.2.3.apk`,
      sha256: 'a'.repeat(64),
      bytes: 9_000_000,
    });
  });

  it('keeps one slash between the host and the file', () => {
    expect(listenerReleaseOf(GOOD, `${BASE}/`)?.url).toBe(`${BASE}/lytro-listener-1.2.3.apk`);
  });

  it("reads staging's copy, whose version carries its tag", () => {
    const staging = { ...GOOD, version: '1.0.0-staging', file: 'lytro-listener-1.0.0-staging.apk' };
    expect(listenerReleaseOf(staging, BASE)).toMatchObject({
      version: '1.0.0-staging',
      url: `${BASE}/lytro-listener-1.0.0-staging.apk`,
    });
  });

  it.each([
    ['a tag with nothing after the dash', { ...GOOD, version: '1.0.0-' }],
    ['a tag with a space', { ...GOOD, version: '1.0.0-two words' }],
    ['two tags', { ...GOOD, version: '1.0.0-staging-x' }],
    ['another site', { ...GOOD, file: 'https://evil.example/app.apk' }],
    ['a path out of the host', { ...GOOD, file: '../other/app.apk' }],
    ['not an APK', { ...GOOD, file: 'lytro-listener.exe' }],
    ['a short checksum', { ...GOOD, sha256: 'abc' }],
    ['a checksum in capitals', { ...GOOD, sha256: 'A'.repeat(64) }],
    ['a loose version', { ...GOOD, version: 'latest' }],
    ['no size', { ...GOOD, bytes: 0 }],
    ['a size in words', { ...GOOD, bytes: '9 MB' }],
    ['nothing', null],
    ['a list', []],
  ])('refuses %s', (_name, body) => {
    expect(listenerReleaseOf(body, BASE)).toBeNull();
  });
});

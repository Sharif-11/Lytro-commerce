import { describe, expect, it } from 'vitest';
import { ListenerReleases, sizeInMegabytes } from '../src/lib/listener/release';

// What counts as a release is checked once, in @lytronix/validators (test/listener-release.spec.ts); here, how the
// page asks for it.
const BASE = 'https://download.lytro.app';
const GOOD = {
  version: '1.2.3',
  file: 'lytro-listener-1.2.3.apk',
  sha256: 'a'.repeat(64),
  bytes: 9_000_000,
};

function answering(body: unknown, status = 200): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe('sizeInMegabytes', () => {
  it('rounds, and never says 0', () => {
    expect(sizeInMegabytes(9 * 1024 * 1024)).toBe(9);
    expect(sizeInMegabytes(9.6 * 1024 * 1024)).toBe(10);
    expect(sizeInMegabytes(1000)).toBe(1);
  });
});

describe('ListenerReleases', () => {
  it('asks the bucket for latest.json', async () => {
    const asked: string[] = [];
    const fetcher = ((url: string) => {
      asked.push(url);
      return Promise.resolve(new Response(JSON.stringify(GOOD)));
    }) as unknown as typeof fetch;
    const release = await new ListenerReleases(BASE, fetcher).latest();
    expect(asked).toEqual([`${BASE}/latest.json`]);
    expect(release?.version).toBe('1.2.3');
  });

  it('is null until a release is uploaded', async () => {
    // A good body, so it's the status that refuses it: some error pages answer with whatever they hold.
    expect(await new ListenerReleases(BASE, answering(GOOD, 404)).latest()).toBeNull();
  });

  it('is null when the bucket cannot be reached, so the page still renders', async () => {
    const down = (() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    expect(await new ListenerReleases(BASE, down).latest()).toBeNull();
  });

  it('is null for a file that does not read as a release', async () => {
    const broken = (() => Promise.resolve(new Response('not json'))) as unknown as typeof fetch;
    expect(await new ListenerReleases(BASE, broken).latest()).toBeNull();
    expect(
      await new ListenerReleases(
        BASE,
        answering({ ...GOOD, file: 'https://evil.example/a.apk' }),
      ).latest(),
    ).toBeNull();
  });
});

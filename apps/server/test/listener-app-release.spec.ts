import { describe, expect, it } from 'vitest';
import { ListenerAppRelease } from '../src/modules/listener/services/listener-app-release';

// TENANT-DASHBOARD-DESIGN §7.44 (small fixes, 2026-11-13): the listener app's release for the dashboard's download,
// read from latest.json on the downloads host and kept a few minutes.
const HOST = 'https://download-staging.lytro.app';
const STAGING = {
  version: '1.0.0-staging',
  file: 'lytro-listener-1.0.0-staging.apk',
  sha256: 'c'.repeat(64),
  bytes: 2_923_023,
};
const MINUTE_MS = 60_000;

/** A downloads host that answers what it's told to, and counts what it was asked. */
class FakeHost {
  asked: string[] = [];
  answer: () => Promise<Response> = () => Promise.resolve(Response.json(STAGING));

  readonly send = ((url: string) => {
    this.asked.push(url);
    return this.answer();
  }) as unknown as typeof fetch;
}

function releaseOver(host: FakeHost, base = HOST) {
  let now = new Date('2026-11-13T06:00:00Z');
  const release = new ListenerAppRelease({ LISTENER_DOWNLOAD_URL: base }, host.send, () => now);
  const later = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  return { release, later };
}

describe("the listener app's release (§7.44)", () => {
  it("reads latest.json on the host it's set to: the version, the size and the file's link there", async () => {
    const host = new FakeHost();
    const { release } = releaseOver(host, `${HOST}/`);
    await expect(release.current()).resolves.toEqual({
      version: '1.0.0-staging',
      url: `${HOST}/lytro-listener-1.0.0-staging.apk`,
      bytes: 2_923_023,
    });
    expect(host.asked).toEqual([`${HOST}/latest.json`]);
  });

  it('keeps a release five minutes, then asks again, so a new one shows without a deploy', async () => {
    const host = new FakeHost();
    const { release, later } = releaseOver(host);
    await release.current();
    later(4 * MINUTE_MS);
    await release.current();
    expect(host.asked).toHaveLength(1);
    host.answer = () =>
      Promise.resolve(
        Response.json({
          ...STAGING,
          version: '1.0.1-staging',
          file: 'lytro-listener-1.0.1-staging.apk',
        }),
      );
    later(MINUTE_MS + 1);
    expect((await release.current())?.version).toBe('1.0.1-staging');
    expect(host.asked).toHaveLength(2);
  });

  it('asks the host once for requests that arrive together', async () => {
    const host = new FakeHost();
    const { release } = releaseOver(host);
    const answers = await Promise.all([release.current(), release.current(), release.current()]);
    expect(host.asked).toHaveLength(1);
    expect(new Set(answers.map((answer) => answer?.version))).toEqual(new Set(['1.0.0-staging']));
  });

  it('is null until a release is uploaded, and asks again a minute on', async () => {
    const host = new FakeHost();
    host.answer = () => Promise.resolve(Response.json(STAGING, { status: 404 }));
    const { release, later } = releaseOver(host);
    await expect(release.current()).resolves.toBeNull();
    later(30_000);
    await expect(release.current()).resolves.toBeNull();
    expect(host.asked).toHaveLength(1);
    host.answer = () => Promise.resolve(Response.json(STAGING));
    later(30_001);
    expect((await release.current())?.version).toBe('1.0.0-staging');
  });

  it.each([
    ['the host cannot be reached', () => Promise.reject(new Error('getaddrinfo ENOTFOUND'))],
    ['the file is not JSON', () => Promise.resolve(new Response('<html>'))],
    [
      'the file points at another site',
      () => Promise.resolve(Response.json({ ...STAGING, file: 'https://evil.example/a.apk' })),
    ],
    [
      'the version is loose',
      () => Promise.resolve(Response.json({ ...STAGING, version: 'latest' })),
    ],
  ])('is null, and offers no link, when %s', async (_name, answer) => {
    const host = new FakeHost();
    host.answer = answer;
    await expect(releaseOver(host).release.current()).resolves.toBeNull();
  });
});

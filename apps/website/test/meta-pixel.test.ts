import { describe, expect, it } from 'vitest';
import { SiteEnvironment } from '../src/lib/env';
import { META_PIXEL_SCRIPT, MetaPixelLoader, type PixelHost } from '../src/lib/meta-pixel';

/** A stand-in for the page: the scripts it was given, and the window Meta's queue lands on. */
function page(): PixelHost & { scripts: { async: boolean; src: string }[] } {
  const scripts: { async: boolean; src: string }[] = [];
  return {
    scripts,
    document: {
      createElement: () => ({ async: false, src: '' }),
      head: {
        appendChild: (node: unknown) => scripts.push(node as { async: boolean; src: string }),
      },
    },
  };
}

describe("Lytro's own Meta pixel (MKT-01)", () => {
  it("loads Meta's script once, with its automatic collection off, and counts the first page", () => {
    const host = page();
    new MetaPixelLoader(host).start('1234567890');

    expect(host.scripts).toEqual([{ async: true, src: META_PIXEL_SCRIPT }]);
    expect(host.fbq?.queue).toEqual([
      ['set', 'autoConfig', false, '1234567890'],
      ['init', '1234567890'],
      ['track', 'PageView'],
    ]);
    expect(host.fbq?.disablePushState).toBe(true);
  });

  it('counts each later page once, and never loads the script twice', () => {
    const host = page();
    const loader = new MetaPixelLoader(host);
    loader.start('1234567890');
    loader.pageView();
    new MetaPixelLoader(host).start('1234567890');

    expect(host.scripts).toHaveLength(1);
    expect(host.fbq?.queue.filter((call) => call[1] === 'PageView')).toHaveLength(3);
  });

  it('sends nothing for a page view before it has started', () => {
    const host = page();
    new MetaPixelLoader(host).pageView();
    expect(host.fbq).toBeUndefined();
    expect(host.scripts).toEqual([]);
  });
});

describe("the site's pixel setting (MKT-05)", () => {
  const pixelOf = (value?: string) =>
    new SiteEnvironment({
      NODE_ENV: 'test',
      ...(value === undefined ? {} : { META_PIXEL_ID: value }),
    }).metaPixelId;

  it('is off unless website.env names a pixel ID of digits', () => {
    expect(pixelOf()).toBeUndefined();
    expect(pixelOf('  ')).toBeUndefined();
    expect(pixelOf('12ab<script>')).toBeUndefined();
    expect(pixelOf(' 1234567890 ')).toBe('1234567890');
  });
});
